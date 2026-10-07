import { devices } from '@playwright/test'

/** The phone the suite runs on: a Pixel-like 390×844 in Bulgarian, Sofia time. */
export const MOBILE = {
  ...devices['Pixel 5'],
  viewport: { width: 390, height: 844 },
  locale: 'bg-BG',
  timezoneId: 'Europe/Sofia',
}
