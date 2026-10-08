import type { Page } from '@playwright/test'
import { addBusiness, nav, openMore, runSetup } from './support/app'
import { BUSINESSES } from './support/businesses'
import type { Business } from './support/businesses'
import { expect, test } from './support/fixtures'
import {
  openSection,
  openSettings,
  renameStage,
  stageNames,
} from './support/settings'

// The genericity check (docs/product-design.md): six unrelated businesses,
// each made through the setup wizard and Settings alone. One account makes
// them one after another with Settings → Добави бизнес (Q13).
test.describe.configure({ mode: 'serial' })

const lower = (word: string) => word.toLocaleLowerCase('bg')

async function switchOf(page: Page, label: RegExp) {
  return page.getByRole('switch', { name: label })
}

/** Settings → Модули: whether the item and reminder modules are on. */
async function expectModules(page: Page, b: Business) {
  await openSection(page, 'Модули')
  const itemLabel = new RegExp(`^${b.item?.plural ?? 'Обекти'}`)
  if (b.item) await expect(await switchOf(page, itemLabel)).toBeChecked()
  else await expect(await switchOf(page, itemLabel)).not.toBeChecked()
  const reminders = await switchOf(page, /^Напомняния/)
  if (b.reminder) await expect(reminders).toBeChecked()
  else await expect(reminders).not.toBeChecked()
  const costs = await switchOf(page, /^Разходи/)
  if (b.costs) await expect(costs).toBeChecked()
  else await expect(costs).not.toBeChecked()
}

/** Settings → Етапи: rename, then the whole list must match the table. */
async function shapeStages(page: Page, b: Business) {
  await openSection(page, 'Етапи')
  for (const [from, to] of b.renames) await renameStage(page, from, to)
  await expect.poll(() => stageNames(page)).toEqual(b.stages)
}

/** Settings → Имена and → Полета, for what the wizard can't say. */
async function shapeItem(page: Page, b: Business) {
  if (!b.item) return
  if (b.itemPlural) {
    await openSection(page, 'Имена')
    await page
      .getByRole('group', { name: 'Нещо на клиента' })
      .getByLabel('Много')
      .fill(b.itemPlural)
    await page.getByRole('button', { name: 'Запази', exact: true }).click()
    await expect(nav(page)).toBeVisible()
  }
  await openSection(page, 'Полета')
  await page.getByRole('tab', { name: b.item.plural }).click()
  for (const name of b.addItemFields ?? []) {
    await page.getByRole('button', { name: 'Поле', exact: true }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Име на полето').fill(name)
    await sheet.getByRole('button', { name: 'Добави полето' }).click()
    await expect(sheet).toBeHidden()
  }
  // The field's row in the list; the live preview beside it is inert.
  for (const field of b.item.fields) {
    await expect(
      page
        .getByRole('main')
        .getByRole('button', { name: new RegExp(`^${field}`) }),
    ).toBeVisible()
  }
}

/** Settings → Напомняния: the rule is on with the asked months, or off. */
async function expectReminderRule(page: Page, b: Business) {
  await openSection(page, 'Напомняния')
  const rule = page.getByRole('switch', {
    name: 'Предлагай напомняне, когато работата е готова',
  })
  if (!b.reminder) {
    await expect(rule).not.toBeChecked()
    return
  }
  await expect(rule).toBeChecked()
  await expect(
    page.getByRole('button', { name: b.reminder, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
}

/** "+": the header, the rows the form shows, then one line saved. */
async function addJobWithOneLine(page: Page, b: Business) {
  await nav(page)
    .getByRole('link', { name: `Добави: ${b.job.singular}` })
    .click()
  await expect(
    page.getByRole('heading', { name: `Добави ${lower(b.job.singular)}` }),
  ).toBeVisible()

  await page.getByLabel('Запишете го като в тетрадка').fill(b.line)
  const readBack = page
    .getByRole('heading', { name: 'Разбрах така' })
    .locator('..')
  await expect(readBack).toContainText(b.client)
  await expect(readBack).toContainText(lower(b.jobTitle))

  // The deposit row is there when the business takes deposits (or the line has one).
  const deposit = readBack.getByText('Капаро', { exact: true })
  if (b.deposits || /капаро/.test(b.line)) await expect(deposit).toBeVisible()
  else await expect(deposit).toHaveCount(0)

  // The repeat switch is there, and on, only for a fixed schedule.
  const repeat = readBack.getByRole('switch', { name: /Повтаряне/ })
  if (b.repeat) {
    await expect(repeat).toBeChecked()
    await expect(readBack).toContainText(b.repeat)
  } else {
    await expect(repeat).toHaveCount(0)
  }

  await page.getByRole('button', { name: 'Запази', exact: true }).click()
  await expect(nav(page)).toBeVisible()
}

/** The job's page: the stages, the repeat line, the reminder offer. */
async function expectJobPage(page: Page, b: Business) {
  await nav(page).getByRole('link', { name: b.job.plural }).click()
  await expect(
    page.getByRole('heading', { name: b.job.plural, level: 1 }),
  ).toBeVisible()
  await page.getByRole('link', { name: new RegExp(b.jobTitle, 'i') }).click()
  await expect(
    page.getByRole('heading', { name: b.jobTitle, level: 1 }),
  ).toBeVisible()

  // The page shows the stage and one step forward; every stage waits
  // behind "Друг етап".
  const stages = page.getByRole('button', { name: 'Друг етап' })
  await stages.click()
  const chips = page.getByRole('group', { name: 'Етап' }).getByRole('button')
  await expect(chips).toHaveText(b.stages)

  // Repeat is folded under "Още", which stays open once opened.
  await openMore(page)
  if (b.repeat) {
    await expect(page.getByText(`Повтаря се: ${lower(b.repeat)}`)).toBeVisible()
  } else {
    await expect(page.getByText(/^Повтаря се/)).toHaveCount(0)
  }

  // Reaching the "done" stage offers the reminder rule's reminder (Q5).
  const done = b.stages[b.stages.length - 2]
  const doneChip = chips.filter({ hasText: new RegExp(`^${done}$`) })
  await doneChip.click()
  const offer = page.getByRole('heading', { name: 'Да напомним ли?' })
  if (b.reminder) {
    await expect(offer).toBeVisible()
    await page.getByRole('button', { name: 'Не сега' }).click()
    await expect(offer).toBeHidden()
  } else {
    await expect(offer).toHaveCount(0)
  }
  // A move folds the list again; opened, it marks the new stage.
  await stages.click()
  await expect(doneChip).toHaveAttribute('aria-pressed', 'true')
}

/** The client's page: the item section by its own word, with an item added. */
async function expectClientPage(page: Page, b: Business) {
  await nav(page).getByRole('link', { name: 'Клиенти' }).click()
  await page.getByRole('link', { name: new RegExp(b.client) }).click()
  await expect(
    page.getByRole('heading', { name: b.client, level: 1 }),
  ).toBeVisible()

  const section = (name: string) =>
    page.getByRole('heading', { name, level: 2 })
  if (!b.item) {
    await expect(section('Обекти')).toHaveCount(0)
    return
  }
  // The items sit under the "More" card.
  await openMore(page)
  await expect(section(b.item.plural)).toBeVisible()

  await page
    .getByRole('region', { name: b.item.plural })
    .or(section(b.item.plural).locator('..').locator('..'))
    .getByRole('link', { name: 'Добави' })
    .click()
  await expect(
    page.getByRole('heading', { name: b.item.singular, level: 1 }),
  ).toBeVisible()
  for (const field of b.item.fields) {
    await expect(page.getByLabel(field, { exact: true })).toBeVisible()
  }
  // Enter saves from the field: the toasts from adding the fields sit just
  // above the nav, where Save stops when it scrolls into view.
  const name = page.getByLabel('Име', { exact: true })
  await name.fill('Първият')
  await name.press('Enter')
  await expect(page.getByText('Първият').first()).toBeVisible()
}

for (const [index, b] of BUSINESSES.entries()) {
  test(`${index + 1}. ${b.title}`, async ({ page }) => {
    if (index === 0) {
      // First sign-in: the user's own business is waiting in setup.
      await expect(page).toHaveURL(/\/setup$/)
    } else {
      await addBusiness(page)
    }
    await runSetup(page, b.answers)

    // The words: the nav, the "+" label and its header.
    await expect(
      nav(page).getByRole('link', { name: b.job.plural }),
    ).toBeVisible()
    await expect(
      nav(page).getByRole('link', { name: `Добави: ${b.job.singular}` }),
    ).toBeVisible()
    await expect(page.getByRole('banner')).toContainText(b.answers.name)

    // Everything else is Settings.
    await shapeStages(page, b)
    await shapeItem(page, b)
    await expectReminderRule(page, b)
    await expectModules(page, b)

    // The result, used the way the owner would.
    await addJobWithOneLine(page, b)
    await expectJobPage(page, b)
    await expectClientPage(page, b)

    // Back in Settings, the item word shows on its Fields tab and the nav.
    await openSettings(page)
  })
}

test('the switcher lists all six businesses', async ({ page }) => {
  await page.getByRole('button', { name: 'Смени бизнеса' }).click()
  for (const b of BUSINESSES) {
    await expect(
      page.getByRole('menuitemradio', { name: b.answers.name }),
    ).toBeVisible()
  }
})
