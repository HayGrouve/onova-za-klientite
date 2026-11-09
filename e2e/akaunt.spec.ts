import { setupClerkTestingToken } from '@clerk/testing/playwright'
import type { Browser, Page } from '@playwright/test'
import { MOBILE } from './support/device'
import { expect, test } from './support/fixtures'

// Sign-in lives on the shared Акаунт (ADR 0012): no Clerk UI here, a start
// page for the signed out, and a menu with only Акаунт and Изход.

/** A fresh, signed-out page on the app. */
async function signedOutPage(browser: Browser, baseURL: string) {
  // Playwright Test hands its own options to `newContext`, the signed-in
  // storage state included: start from an empty one.
  const context = await browser.newContext({
    ...MOBILE,
    baseURL,
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await setupClerkTestingToken({ page })
  return { page, close: () => context.close() }
}

/**
 * Waits for the page to leave the app for sign-in, and checks it went to the
 * configured sign-in URL (the Account Portal when none is set) with an
 * absolute way back to `back`.
 */
async function expectSignIn(
  page: Page,
  back: string,
  go: () => Promise<unknown>,
) {
  const configured = process.env.VITE_CLERK_SIGN_IN_URL?.trim()
  // Clerk may pass through its own hosts on the way, so wait for the
  // sign-in page itself.
  const isSignIn = (url: URL) =>
    configured
      ? url.href.startsWith(configured)
      : url.hostname.endsWith('.accounts.dev') && url.pathname === '/sign-in'
  await go()
  await page.waitForURL(isSignIn, { waitUntil: 'commit' })
  const url = new URL(page.url())
  expect(url.origin).not.toBe(new URL(back).origin)
  // On a development instance Clerk carries it in the hash
  // (`#/?redirect_url=`) next to its dev browser token.
  const fromHash = new URLSearchParams(url.hash.replace(/^#\/?\??/, ''))
  expect(
    url.searchParams.get('redirect_url') ?? fromHash.get('redirect_url'),
  ).toBe(back)
}

test.describe('signed out', () => {
  test('/ is the start page with Вход and the legal links', async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await signedOutPage(browser, String(baseURL))
    try {
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'Онова за клиентите' }),
      ).toBeVisible()
      await expect(
        page.getByText('Клиенти, работа и пари на едно място.'),
      ).toBeVisible()
      const legal = page.getByRole('navigation', { name: 'Правна информация' })
      await expect(
        legal.getByRole('link', { name: 'Поверителност' }),
      ).toHaveAttribute('href', 'https://onovaza.com/poveritelnost#klientite')
      await expect(
        legal.getByRole('link', { name: 'Условия' }),
      ).toHaveAttribute('href', 'https://onovaza.com/usloviya#klientite')
      await expect(
        legal.getByRole('link', { name: 'Обработване на данни' }),
      ).toHaveAttribute('href', 'https://onovaza.com/obrabotvane-na-danni')

      await expectSignIn(page, new URL('/', String(baseURL)).href, () =>
        page.getByRole('button', { name: 'Вход' }).click(),
      )
    } finally {
      await close()
    }
  })

  test('a deep link goes straight to sign-in and asks to come back to it', async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await signedOutPage(browser, String(baseURL))
    try {
      await expectSignIn(
        page,
        new URL('/clients?q=ivan', String(baseURL)).href,
        () => page.goto('/clients?q=ivan'),
      )
    } finally {
      await close()
    }
  })

  test('/login, kept for old bookmarks, does the same', async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await signedOutPage(browser, String(baseURL))
    try {
      await expectSignIn(page, new URL('/money', String(baseURL)).href, () =>
        page.goto('/login?redirect=%2Fmoney'),
      )
    } finally {
      await close()
    }
  })
})

test.describe('signed in', () => {
  test('the Акаунт menu has only Акаунт and Изход, and the gear opens Настройки', async ({
    page,
  }) => {
    // A fresh account starts on setup; skip it to reach the shell.
    await page.getByRole('button', { name: 'Пропусни всичко' }).click()
    await page.getByRole('button', { name: 'Да, започвам' }).click()
    await expect(page).toHaveURL(/\/$/)

    const banner = page.getByRole('banner')
    await banner.getByRole('button', { name: 'Акаунт' }).click()
    const items = page.getByRole('menuitem')
    await expect(items).toHaveText(['Акаунт', 'Изход'])
    await expect(items.first()).toHaveAttribute('href', /^https:\/\//)
    await page.keyboard.press('Escape')

    await banner.getByRole('link', { name: 'Настройки' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(
      page.getByRole('heading', { name: 'Настройки', level: 1 }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Правна информация' }),
    ).toBeVisible()
  })
})
