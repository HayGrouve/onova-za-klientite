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
    const confirm = page.getByLabel('Напиши ИЗТРИЙ, за да потвърдиш')
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

type Account = { user: TestUser; state: StorageState }

type Worker = { accountFor: (file: string) => Promise<Account> }

/** A fresh Clerk user, signed in once. The first load creates its business. */
async function newAccount(browser: Browser, baseURL: string): Promise<Account> {
  const user = await createTestUser()
  const context = await browser.newContext({ ...MOBILE, baseURL })
  try {
    const page = await context.newPage()
    await signIn(page, user.email)
    // The first load creates the user's business and sends them to setup.
    await page.waitForURL(/\/setup$/)
    return { user, state: await context.storageState() }
  } catch (error) {
    await deleteClerkUser(user.id).catch(() => {})
    throw error
  } finally {
    await context.close()
  }
}

/**
 * One fresh Clerk user per spec file, deleted (with its Convex data) when the
 * worker ends, even after a failure. Keyed by file, not by worker: with one
 * worker (CI) every spec file runs in the same worker, and a spec must not
 * start on the businesses another spec made.
 * Each user signs in once; every test's page starts from that session.
 */
export const test = base.extend<object, Worker>({
  accountFor: [
    async ({ browser }, use, workerInfo) => {
      const baseURL = String(workerInfo.project.use.baseURL)
      const byFile = new Map<string, Promise<Account>>()
      try {
        await use((file) => {
          let account = byFile.get(file)
          if (!account) {
            account = newAccount(browser, baseURL)
            byFile.set(file, account)
          }
          return account
        })
      } finally {
        for (const account of byFile.values()) {
          const created = await account.catch(() => null)
          if (created) await deleteAccount(browser, created.user, baseURL)
        }
      }
    },
    { scope: 'worker', timeout: 300_000 },
  ],
  storageState: async ({ accountFor }, use, testInfo) => {
    await use((await accountFor(testInfo.file)).state)
  },
  page: async ({ page }, use) => {
    await setupClerkTestingToken({ page })
    await page.goto('/')
    await use(page)
  },
})

export { expect }
