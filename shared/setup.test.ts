import { describe, expect, it } from 'vitest'
import {
  ITEM_KINDS,
  JOB_WORDS,
  answersFromBusiness,
  defaultBusiness,
  jobFormFields,
  planSetup,
  settingsFromAnswers,
} from './setup'
import type { CurrentSetup } from './setup'
import { STAGE_GROUPS, stagesFor } from './stages'

const fresh = (): CurrentSetup => ({
  ...defaultBusiness(),
  stages: stagesFor('single').map(({ name, group }) => ({ name, group })),
  itemFields: [],
  services: [],
  hasJobs: false,
  setupDone: false,
})

describe('defaultBusiness', () => {
  it('skipping setup gives a working business', () => {
    const business = defaultBusiness()
    expect(business.name).not.toBe('')
    expect(business.words.job.singular).toBe('Поръчка')
    expect(business.modules.appointments).toBe(true)
    expect(business.modules.items).toBe(false)
  })

  it('returns a fresh copy each time', () => {
    const a = defaultBusiness()
    a.words.job.singular = 'Ремонт'
    expect(defaultBusiness().words.job.singular).toBe('Поръчка')
  })
})

describe('stagesFor', () => {
  it.each(['single', 'multi'] as const)(
    '%s flow has a stage in every group',
    (flow) => {
      const groups = new Set(stagesFor(flow).map((stage) => stage.group))
      for (const group of STAGE_GROUPS) expect(groups.has(group)).toBe(true)
    },
  )
})

describe('settingsFromAnswers', () => {
  it('skipping everything gives a working setup', () => {
    const settings = settingsFromAnswers({})
    expect(settings.name).toBe('Моят бизнес')
    expect(settings.words.job.singular).toBe('Поръчка')
    expect(settings.jobFlow).toBe('single')
    expect(settings.item).toBeNull()
    expect(settings.modules).toEqual({
      appointments: true,
      costs: true,
      items: false,
      reminders: false,
      services: false,
    })
    expect(settings.services).toEqual([])
    expect(settings.repeatDefault).toBeUndefined()
    expect(settings.reminderRule).toBeUndefined()
  })

  it('the furniture maker: several steps, deposits, costs', () => {
    const settings = settingsFromAnswers({
      businessName: '  Мебели Стоянов ',
      jobWord: JOB_WORDS[0],
      flow: 'multi',
      hasItem: false,
      deposits: true,
      costs: true,
      repeat: 'none',
      services: [
        { name: 'Монтаж', price: '40' },
        { name: ' ', price: '10' },
      ],
    })
    expect(settings.name).toBe('Мебели Стоянов')
    expect(settings.stages.map((stage) => stage.name)).toEqual([
      'Запитване',
      'Оглед',
      'В работа',
      'Готово',
      'Отказано',
    ])
    expect(settings.depositsOnNewJob).toBe(true)
    expect(settings.services).toEqual([{ name: 'Монтаж', priceCents: 4000 }])
    expect(settings.modules.services).toBe(true)
  })

  it('the AC technician: one visit, an item with fields, reminders in a year', () => {
    const climate = ITEM_KINDS.find(
      (kind) => kind.word.singular === 'Климатик',
    )!
    const settings = settingsFromAnswers({
      jobWord: JOB_WORDS.find((word) => word.singular === 'Посещение'),
      flow: 'single',
      hasItem: true,
      item: climate,
      costs: false,
      repeat: 'months',
      reminderMonths: 12,
    })
    expect(settings.words.job.plural).toBe('Посещения')
    expect(settings.words.item.singular).toBe('Климатик')
    expect(settings.item?.fields).toEqual(['Модел', 'Помещение'])
    expect(settings.modules).toMatchObject({
      items: true,
      costs: false,
      reminders: true,
    })
    expect(settings.reminderRule).toEqual({ months: 12 })
  })

  it('the office cleaner repeats weekly by default', () => {
    const settings = settingsFromAnswers({
      repeat: 'schedule',
      repeatEvery: '2weeks',
    })
    expect(settings.repeatDefault).toEqual({ every: 2, unit: 'week' })
    expect(settings.modules.reminders).toBe(false)
  })

  it('an own word without a plural gets one guessed', () => {
    const settings = settingsFromAnswers({
      jobWord: { singular: 'Урок', plural: '', gender: 'm' },
    })
    expect(settings.words.job.plural).toBe('Уроци')
  })

  it('an item answer of "yes" without a name falls back to no item', () => {
    expect(settingsFromAnswers({ hasItem: true }).item).toBeNull()
  })
})

describe('jobFormFields', () => {
  it('shows what the answers need, in order', () => {
    expect(jobFormFields(settingsFromAnswers({}))).toEqual([
      'client',
      'title',
      'price',
      'when',
    ])
    expect(
      jobFormFields(
        settingsFromAnswers({
          flow: 'multi',
          deposits: true,
          hasItem: true,
          item: ITEM_KINDS[0],
          repeat: 'schedule',
        }),
      ),
    ).toEqual(['client', 'item', 'title', 'price', 'deposit', 'due', 'repeat'])
  })
})

describe('planSetup', () => {
  it('a fresh business gets the new flow’s stages instead of the defaults', () => {
    const plan = planSetup(fresh(), settingsFromAnswers({ flow: 'multi' }))
    expect(plan.replaceStages).toBe(true)
    expect(plan.stagesToAdd.map((stage) => stage.name)).toContain('Оглед')
  })

  it('a first run keeps the stages when the flow already matches', () => {
    const plan = planSetup(fresh(), settingsFromAnswers({ flow: 'single' }))
    expect(plan.replaceStages).toBe(false)
    expect(plan.stagesToAdd).toEqual([])
  })

  it('running setup again never deletes a stage: new ones are added, old ones kept', () => {
    const current = { ...fresh(), hasJobs: true, setupDone: true }
    const plan = planSetup(current, settingsFromAnswers({ flow: 'multi' }))
    expect(plan.replaceStages).toBe(false)
    expect(plan.stagesToAdd.map((stage) => stage.name)).toEqual([
      'Запитване',
      'Оглед',
    ])
  })

  it('item fields are added and existing ones kept; services are merged by name', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      itemFields: ['Модел'],
      services: [{ name: 'Профилактика', priceCents: 4000 }],
    }
    const plan = planSetup(
      current,
      settingsFromAnswers({
        hasItem: true,
        item: ITEM_KINDS.find((kind) => kind.word.singular === 'Климатик'),
        services: [
          { name: 'профилактика', price: '50' },
          { name: 'Монтаж', price: '150' },
        ],
      }),
    )
    expect(plan.fieldsToAdd).toEqual(['Помещение'])
    expect(plan.servicesToUpdate).toEqual([
      { name: 'Профилактика', priceCents: 5000 },
    ])
    expect(plan.servicesToAdd).toEqual([{ name: 'Монтаж', priceCents: 15000 }])
  })

  it('lists renamed words and switched modules', () => {
    const plan = planSetup(
      { ...fresh(), setupDone: true },
      settingsFromAnswers({
        jobWord: JOB_WORDS.find((word) => word.singular === 'Ремонт'),
        costs: false,
      }),
    )
    expect(plan.wordChanges).toEqual([
      { key: 'job', from: 'Поръчка', to: 'Ремонт' },
    ])
    expect(plan.modulesOff).toEqual(['costs'])
    expect(plan.modulesOn).toEqual([])
  })

  it('nothing changes when the answers match the business', () => {
    const plan = planSetup(
      { ...fresh(), setupDone: true },
      settingsFromAnswers({}),
    )
    expect(plan.stagesToAdd).toEqual([])
    expect(plan.wordChanges).toEqual([])
    expect(plan.modulesOn).toEqual([])
    expect(plan.modulesOff).toEqual([])
  })
})

describe('answersFromBusiness', () => {
  it('re-running setup starts from what the business has now', () => {
    const current: CurrentSetup = {
      ...fresh(),
      name: 'Хладина Сервиз',
      words: {
        ...defaultBusiness().words,
        job: { singular: 'Посещение', plural: 'Посещения', gender: 'n' },
        item: { singular: 'Климатик', plural: 'Климатици', gender: 'm' },
      },
      modules: {
        ...defaultBusiness().modules,
        items: true,
        reminders: true,
        costs: false,
        services: true,
      },
      reminderRule: { months: 12 },
      itemFields: ['Модел', 'Помещение'],
      services: [{ name: 'Профилактика', priceCents: 5000 }],
      setupDone: true,
    }
    const answers = answersFromBusiness(current)
    const settings = settingsFromAnswers(answers, current)
    expect(settings.name).toBe('Хладина Сервиз')
    expect(settings.words.job.singular).toBe('Посещение')
    expect(settings.item?.word.singular).toBe('Климатик')
    expect(settings.modules).toEqual(current.modules)
    expect(answers.services).toEqual([{ name: 'Профилактика', price: '50' }])
    const plan = planSetup(current, settings)
    expect(plan.fieldsToAdd).toEqual([])
    expect(plan.modulesOn).toEqual([])
    expect(plan.modulesOff).toEqual([])
    expect(plan.wordChanges).toEqual([])
  })
})
