import { defineConfig } from '@playwright/test'
import { MOBILE } from './e2e/support/device'

// Locally the Clerk and Convex keys live in .env.local; in CI they are real
// environment variables. Vite reads the same file for the dev server.
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local: the environment must already hold the keys.
}

// `E2E_PORT` lets the suite use its own dev server while another app is on :3000.
const port = process.env.E2E_PORT ?? '3000'
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each spec file signs in as its own fresh user, so files could run side by
  // side. Two workers keep the shared dev deployment calm.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: MOBILE,
    },
  ],
  webServer: {
    command: `pnpm exec vite dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
