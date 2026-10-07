import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test as base } from '@playwright/test'
import type { Browser, BrowserContextOptions, Page } from '@playwright/test'
import { clerkUserExists, createTestUser, deleteClerkUser } from './clerk-api'
import type { TestUser } from './clerk-api'
import { runSetup } from './app'
import { MOBILE } from './device'

/** Signs the page in as the Clerk test user (email code 424242, no real mail). */
export async function signIn(page: Page, email: string) {
  await setupClerkTestingToken({ page })
  await page.goto('/login')
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: email },
  })
  await page.goto('/')
}

/**
 * Deletes the account the way a person would (Settings → Data, type ИЗТРИЙ),
 * which removes the user's businesses from Convex and then the Clerk user.
 * Whatever happens, the Clerk user is removed through the Backend API too.
 */
async function deleteAccount(
  browser: Browser,
  user: TestUser,
  baseURL: string,
) {
  const context = await browser.newContext({ ...MOBILE, baseURL })
  try {
    const page = await context.newPage()
    await signIn(page, user.email)
    await page.goto('/settings/data')
    // A business whose setup never finished sends every page to setup first.
    const setupName = page.getByLabel('Име на бизнеса')
    const confirm = page.getByLabel('Напишете ИЗТРИЙ, за да потвърдите')
    await expect(setupName.or(confirm)).toBeVisible()
    if (await setupName.isVisible()) {
      await runSetup(page, {})
      await page.goto('/settings/data')
    }
    await confirm.fill('ИЗТРИЙ')
    await page.getByRole('button', { name: 'Изтрий завинаги' }).click()
    // Convex deletes in batches and removes the Clerk user as its last step.
    await expect
      .poll(() => clerkUserExists(user.id), { timeout: 45_000 })
      .toBe(false)
  } catch (error) {
    console.warn(
      `E2E cleanup: could not delete ${user.email} through the app.`,
      error instanceof Error ? error.message : error,
    )
  } finally {
    await context.close()
    await deleteClerkUser(user.id).catch(() => {})
  }
}

type StorageState = Exclude<
  BrowserContextOptions['storageState'],
  string | undefined
>

type Worker = { account: TestUser; authState: StorageState }

/**
 * `account` is one fresh Clerk user per worker, i.e. per spec file, deleted
 * (with its Convex data) when the worker ends, even after a failure.
 * The worker signs in once; every test's page starts from that session.
 */
export const test = base.extend<object, Worker>({
  account: [
    async ({ browser }, use, workerInfo) => {
      const user = await createTestUser()
      try {
        await use(user)
      } finally {
        const baseURL = String(workerInfo.project.use.baseURL)
        await deleteAccount(browser, user, baseURL)
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  authState: [
    async ({ browser, account }, use, workerInfo) => {
      const baseURL = String(workerInfo.project.use.baseURL)
      const context = await browser.newContext({ ...MOBILE, baseURL })
      const page = await context.newPage()
      await signIn(page, account.email)
      // The first load creates the user's business and sends them to setup.
      await page.waitForURL(/\/setup$/)
      const state = await context.storageState()
      await context.close()
      await use(state)
    },
    { scope: 'worker' },
  ],
  storageState: async ({ authState }, use) => {
    await use(authState)
  },
  page: async ({ page }, use) => {
    await setupClerkTestingToken({ page })
    await page.goto('/')
    await use(page)
  },
})

export { expect }
