import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** Everything the setup wizard asks. A missing key is skipped ("Пропусни"). */
export type Answers = {
  name?: string
  /** One of the five offered words, or an own word with its plural. */
  job?: string | { own: string; plural: string }
  flow?: 'single' | 'multi'
  /** `false` answers "Не". An own item word is typed under "Друго". */
  item?: false | { kind: string } | { own: string }
  deposits?: boolean
  costs?: boolean
  repeat?:
    | 'none'
    | {
        schedule:
          | 'Всяка седмица'
          | 'През седмица'
          | 'Всеки месец'
          | 'Всеки 3 месеца'
          | 'Всеки 6 месеца'
          | 'Всяка година'
      }
    | {
        months:
          | 'След месец'
          | 'След 2 месеца'
          | 'След 3 месеца'
          | 'След 6 месеца'
          | 'След година'
      }
}

export const nav = (page: Page) =>
  page.getByRole('navigation', { name: 'Основно меню' })

/** The chips of one question: the toggle group named like the question. */
function question(page: Page, title: string): Locator {
  return page.getByRole('group', { name: title, exact: true }).first()
}

/** A chip or row of the question. Rows also carry a description, so match the start. */
async function choose(page: Page, title: string, option: string) {
  const start = new RegExp(
    `^${option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`,
  )
  await question(page, title).getByRole('button', { name: start }).click()
}

const next = (page: Page) => page.getByRole('button', { name: 'Напред' })
const skip = (page: Page) => page.getByRole('button', { name: 'Пропусни' })

/** Waits for the setup screen of a business that was just created. */
export async function expectSetup(page: Page) {
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByLabel('Име на бизнеса')).toBeVisible()
}

/**
 * Answers the eight setup questions in order and confirms the review.
 * Starts on the first question, ends on Today.
 */
export async function runSetup(page: Page, answers: Answers) {
  await expectSetup(page)

  // 1. Name
  if (answers.name === undefined) await skip(page).click()
  else {
    await page.getByLabel('Име на бизнеса').fill(answers.name)
    await next(page).click()
  }

  // 2. The word for a job
  const jobTitle = 'Как наричате работата, която вършите за клиент?'
  await expect(page.getByText(jobTitle).first()).toBeVisible()
  if (answers.job === undefined) await skip(page).click()
  else {
    if (typeof answers.job === 'string') {
      await choose(page, jobTitle, answers.job)
    } else {
      await choose(page, jobTitle, 'Друга дума')
      await page.getByLabel('Вашата дума').fill(answers.job.own)
      await page.getByLabel('Когато са няколко').fill(answers.job.plural)
    }
    await next(page).click()
  }

  // 3. One go or in stages
  const flowTitle = 'Как протича работата ви обикновено?'
  await expect(page.getByText(flowTitle).first()).toBeVisible()
  if (answers.flow === undefined) await skip(page).click()
  else {
    await choose(
      page,
      flowTitle,
      answers.flow === 'single' ? 'Наведнъж' : 'На етапи',
    )
    await next(page).click()
  }

  // 4. Something the client owns
  const itemTitle = 'Работите ли върху нещо, което е на клиента?'
  await expect(page.getByText(itemTitle).first()).toBeVisible()
  if (answers.item === undefined) await skip(page).click()
  else {
    await choose(page, itemTitle, answers.item === false ? 'Не' : 'Да')
    if (answers.item !== false) {
      const nameTitle = 'Как го наричате?'
      if ('kind' in answers.item) {
        await choose(page, nameTitle, answers.item.kind)
      } else {
        await choose(page, nameTitle, 'Друго')
        await page.getByLabel('Вашата дума').fill(answers.item.own)
      }
    }
    await next(page).click()
  }

  // 5. Deposits and costs (two questions on one screen)
  await expect(
    page.getByText('Взимате ли капаро или аванс?').first(),
  ).toBeVisible()
  if (answers.deposits === undefined && answers.costs === undefined) {
    await skip(page).click()
  } else {
    if (answers.deposits !== undefined) {
      await choose(
        page,
        'Взимате ли капаро или аванс?',
        answers.deposits ? 'Да' : 'Не',
      )
    }
    if (answers.costs !== undefined) {
      await choose(
        page,
        'Да следим ли разходите ви?',
        answers.costs ? 'Да' : 'Не',
      )
    }
    await next(page).click()
  }

  // 6. Repeat
  const repeatTitle = 'Клиентите връщат ли се редовно?'
  await expect(page.getByText(repeatTitle).first()).toBeVisible()
  if (answers.repeat === undefined) await skip(page).click()
  else {
    if (answers.repeat === 'none') {
      await choose(page, repeatTitle, 'Не особено')
    } else if ('schedule' in answers.repeat) {
      await choose(page, repeatTitle, 'По график')
      await choose(page, 'Колко често?', answers.repeat.schedule)
    } else {
      await choose(page, repeatTitle, 'На няколко месеца')
      await choose(page, 'След колко време да напомним?', answers.repeat.months)
    }
    await next(page).click()
  }

  // 7. Services and 8. Import: skipped
  await expect(page.getByText('Най-честите ви услуги и цени')).toBeVisible()
  await skip(page).click()
  await expect(page.getByText('Откъде да вземем')).toBeVisible()
  await skip(page).click()

  // Review, then start
  await expect(
    page.getByRole('heading', { name: 'Така ли работите?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Да, започвам' }).click()
  await expect(nav(page)).toBeVisible()
}

/** Settings → Добави бизнес: creates the next business and opens its setup. */
export async function addBusiness(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: /Добави бизнес/ }).click()
  await expectSetup(page)
}
