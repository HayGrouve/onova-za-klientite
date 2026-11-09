import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Opens Settings from the gear in the phone's header. */
export async function openSettings(page: Page) {
  const heading = page.getByRole('heading', { name: 'Настройки', level: 1 })
  if (await heading.isVisible()) return
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Настройки' })
    .click()
  await expect(heading).toBeVisible()
}

/** Opens one Settings section by its title, e.g. "Етапи". */
export async function openSection(page: Page, title: string) {
  await openSettings(page)
  await page.getByRole('link', { name: new RegExp(`^${title}`) }).click()
  await expect(
    page.getByRole('heading', { name: title, level: 1 }),
  ).toBeVisible()
}

/** The stage names, in order, on Settings → Етапи. */
export async function stageNames(page: Page): Promise<string[]> {
  const rows = page.getByRole('main').getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  const texts = await rows.allInnerTexts()
  return texts.map((text) => text.split('\n')[0].trim())
}

/** Settings → Етапи → one stage → new name → save. */
export async function renameStage(page: Page, from: string, to: string) {
  await page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByText(from, { exact: true }) })
    .getByRole('button')
    .first()
    .click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Име', { exact: true }).fill(to)
  await sheet.getByRole('button', { name: 'Запази' }).click()
  await expect(sheet).toBeHidden()
  await expect(
    page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ has: page.getByText(to, { exact: true }) }),
  ).toBeVisible()
}
