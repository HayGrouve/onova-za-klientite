import type { Locator, Page } from '@playwright/test'
import { addBusiness, nav, runSetup } from './support/app'
import { expect, test } from './support/fixtures'

// One business, one job, followed from the first sign-in to the summary image.
// The tests build on each other, so they run in order on one account.
test.describe.configure({ mode: 'serial' })

const BUSINESS = 'Мебели Е2Е'

/** The value under a label in a figure card: the label's next sibling. */
const figure = (page: Page, label: string): Locator =>
  page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=following-sibling::div[1]')

test('first sign-in opens setup, and a few answers start the business', async ({
  page,
}) => {
  await runSetup(page, { name: BUSINESS, job: 'Поръчка', flow: 'multi' })

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('banner')).toContainText(BUSINESS)
  await expect(nav(page).getByRole('link', { name: 'Поръчки' })).toBeVisible()
})

test('"+" reads one line back and saves a job with its deposit', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Добави: Поръчка' }).click()
  await expect(
    page.getByRole('heading', { name: 'Какво записваме?' }),
  ).toBeVisible()

  await page
    .getByLabel('Запишете го като в тетрадка')
    .fill('Иван Петров, гардероб, 950, капаро 300, до 20.10')

  const readBack = page
    .getByRole('heading', { name: 'Разбрах така' })
    .locator('..')
  await expect(readBack).toContainText('Иван Петров')
  await expect(readBack).toContainText('ще се добави')
  await expect(readBack).toContainText('гардероб')
  await expect(readBack).toContainText('950')
  await expect(readBack).toContainText('300')
  await expect(readBack).toContainText('20.10')

  await page.getByRole('button', { name: 'Запази', exact: true }).click()
  await expect(nav(page)).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('the job shows its money, and a payment moves the balance', async ({
  page,
}) => {
  await nav(page).getByRole('link', { name: 'Поръчки' }).click()
  await page.getByRole('link', { name: /Гардероб/ }).click()
  await expect(page.getByRole('heading', { name: 'Гардероб' })).toBeVisible()

  // 950 price, 300 deposit paid, 650 left.
  await expect(figure(page, 'Цена')).toContainText('950')
  await expect(figure(page, 'Платено')).toContainText('300')
  await expect(figure(page, 'Остатък')).toContainText('650')

  await page.getByRole('button', { name: 'Плащане', exact: true }).click()
  // One question at a time: how much, how, then the review (D117).
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Сума', { exact: true }).fill('200')
  await sheet.getByRole('button', { name: 'Напред', exact: true }).click()
  await sheet.getByRole('button', { name: 'В брой', exact: true }).click()
  // The review shows what is recorded and asks once more.
  await sheet.getByRole('button', { name: /^Запиши 200/ }).click()

  await expect(figure(page, 'Платено')).toContainText('500')
  await expect(figure(page, 'Остатък')).toContainText('450')
})

test('the Money screen adds the payments up', async ({ page }) => {
  await nav(page).getByRole('link', { name: 'Пари' }).click()
  await expect(page.getByRole('heading', { name: 'Пари' })).toBeVisible()

  await expect(figure(page, 'Получени')).toContainText('500')
  await expect(figure(page, 'Дължат ми')).toContainText('450')
  // No costs yet, so the month's profit is what came in.
  await expect(figure(page, 'Печалба за месеца')).toContainText('500')
  await expect(
    page.getByRole('link', { name: /Иван Петров.*450/ }).first(),
  ).toBeVisible()
})

test('the job summary is an image, and it is not an invoice', async ({
  page,
}) => {
  await nav(page).getByRole('link', { name: 'Поръчки' }).click()
  await page.getByRole('link', { name: /Гардероб/ }).click()
  await page.getByRole('button', { name: 'Обобщение' }).click()

  const preview = page.getByRole('img', { name: 'Преглед на обобщението' })
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('src', /^(blob|data):/)
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)

  // The picture really is a PNG (its bytes start with the PNG signature).
  const signature = await preview.evaluate(async (img: HTMLImageElement) => {
    const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer())
    return { head: Array.from(bytes.slice(0, 4)), size: bytes.length }
  })
  expect(signature.head).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(signature.size).toBeGreaterThan(2_000)

  // The words inside the picture can't be read from the page. The Viber text
  // is built from the same input, and it carries the line.
  const viber = page.getByRole('link', { name: 'Изпрати текст във Viber' })
  const href = (await viber.getAttribute('href')) ?? ''
  expect(decodeURIComponent(href)).toContain('Това не е фактура')
})

test('cancelling asks why, and the job keeps the reason', async ({ page }) => {
  await nav(page).getByRole('link', { name: 'Поръчки' }).click()
  await page.getByRole('link', { name: /Гардероб/ }).click()
  await page.getByRole('button', { name: 'Друг етап' }).click()
  // The Cancelled-group stage is the last chip.
  await page
    .getByRole('group', { name: 'Етап' })
    .getByRole('button')
    .last()
    .click()

  // One of the usual reasons fills the box; it could also be typed.
  await page.getByRole('button', { name: 'Скъпо' }).click()
  await expect(page.getByLabel(/Причина/)).toHaveValue('Скъпо')
  await page.getByRole('button', { name: 'Премести' }).click()

  await expect(page.getByText('Причина: Скъпо')).toBeVisible()
})

test('the calendar plans past the week, and "+" starts on its day', async ({
  page,
}) => {
  await nav(page).getByRole('link', { name: 'Днес' }).click()
  // Two months on, the 15th: far past the week Today lists.
  await page.getByRole('button', { name: 'Следващ месец' }).click()
  await page.getByRole('button', { name: 'Следващ месец' }).click()
  await page.getByRole('button', { name: /^[а-я]+, 15 [а-я]+/ }).click()
  await expect(page.getByText('Нищо за този ден.')).toBeVisible()
  await page.getByRole('link', { name: /^Добави: Поръчка за/ }).click()

  const line = page.getByLabel('Запишете го като в тетрадка')
  await line.fill('Мария Колева, шкаф, 500')
  const readBack = page
    .getByRole('heading', { name: 'Разбрах така' })
    .locator('..')
  // The job's due date is the day it was started from.
  await expect(readBack).toContainText('15.')
  await line.press('Enter')

  // Back on the same day, which now lists the job.
  await expect(page).toHaveURL(/day=\d{4}-\d{2}-15/)
  await expect(page.getByRole('link', { name: /^Шкаф/ })).toBeVisible()
})

test('deleting a business asks for its name, and only that one goes', async ({
  page,
}) => {
  await addBusiness(page)
  await runSetup(page, { name: 'Временен Е2Е' })
  await page.goto('/settings/business')
  await page.getByRole('button', { name: 'Изтрий бизнеса…' }).click()

  const typed = page.getByLabel(/напишете името на бизнеса/)
  const remove = page.getByRole('button', { name: 'Изтрий завинаги' })
  await typed.fill('Временен')
  await expect(remove).toBeDisabled()
  // Case and spacing don't count.
  await typed.fill(' временен  е2е ')
  await remove.click()

  await expect(
    page.getByText('Бизнесът „Временен Е2Е“ е изтрит.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Смени бизнеса' }).click()
  await expect(
    page.getByRole('menuitemradio', { name: 'Временен Е2Е' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('menuitemradio', { name: BUSINESS }),
  ).toBeVisible()
})
