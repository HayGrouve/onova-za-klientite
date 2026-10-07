import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ITEM_KINDS,
  JOB_WORDS,
  MAX_SERVICES,
  answersFromBusiness,
  defaultBusiness,
  jobFormFields,
  planSetup,
  settingsFromAnswers,
  stagesAfter,
} from './setup'
import type { CurrentSetup, SetupPlan } from './setup'
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

  it('custom stages are left alone when the flow answer is unchanged', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      jobFlow: 'multi',
      stages: [
        { name: 'Оглед', group: 'new' },
        { name: 'Изработка', group: 'in_progress' },
        { name: 'Монтаж', group: 'in_progress' },
        { name: 'Готово', group: 'done' },
      ],
    }
    expect(
      planSetup(current, settingsFromAnswers({ flow: 'multi' }, current))
        .stagesToAdd,
    ).toEqual([])
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

const NO_CHANGES: SetupPlan = {
  replaceStages: false,
  stagesToAdd: [],
  fieldsToAdd: [],
  servicesToAdd: [],
  servicesToUpdate: [],
  wordChanges: [],
  modulesOn: [],
  modulesOff: [],
}

/** Run setup again and confirm every answer as it was filled in. */
function confirmUnchanged(current: CurrentSetup) {
  const answers = answersFromBusiness(current)
  const settings = settingsFromAnswers(answers, current)
  return { answers, settings, plan: planSetup(current, settings) }
}

describe('running setup again and confirming changes nothing', () => {
  const word = fc.constantFrom(...JOB_WORDS, {
    singular: 'Любимец',
    plural: 'Любимци',
    gender: 'm' as const,
  })
  const serviceNames = Array.from({ length: 12 }, (_, i) => `Услуга ${i + 1}`)
  const fieldNames = [
    'Модел',
    'Помещение',
    'Порода',
    'Характер',
    'Рег. номер',
    'Пробег',
    'Цвят',
    'Площ',
    'Адрес',
  ]
  const business: fc.Arbitrary<CurrentSetup> = fc.record({
    name: fc.constantFrom('Груминг у дома - Ели', 'Мебели Стоянов'),
    words: fc.record({
      client: word,
      job: word,
      item: word,
      appointment: word,
    }),
    modules: fc.record({
      appointments: fc.boolean(),
      costs: fc.boolean(),
      items: fc.boolean(),
      reminders: fc.boolean(),
      services: fc.boolean(),
    }),
    jobFlow: fc.constantFrom('single' as const, 'multi' as const),
    depositsOnNewJob: fc.boolean(),
    repeatDefault: fc.option(
      fc.record({
        every: fc.integer({ min: 1, max: 4 }),
        unit: fc.constantFrom('week' as const, 'month' as const),
      }),
      { nil: undefined },
    ),
    reminderRule: fc.option(
      fc.record({ months: fc.integer({ min: 1, max: 60 }) }),
      { nil: undefined },
    ),
    stages: fc.constantFrom(
      ...(['single', 'multi'] as const).map((flow) =>
        stagesFor(flow).map(({ name, group }) => ({ name, group })),
      ),
    ),
    itemFields: fc.uniqueArray(fc.constantFrom(...fieldNames), {
      maxLength: fieldNames.length,
    }),
    services: fc.uniqueArray(
      fc.record({
        name: fc.constantFrom(...serviceNames),
        priceCents: fc.integer({ min: 0, max: 500_000 }),
      }),
      { selector: (service) => service.name, maxLength: serviceNames.length },
    ),
    hasJobs: fc.boolean(),
    setupDone: fc.constant(true),
  })

  it('whatever Settings made of the business', () => {
    fc.assert(
      fc.property(business, (current) => {
        const { answers, settings, plan } = confirmUnchanged(current)
        expect(settings).toMatchObject({
          name: current.name,
          words: current.words,
          modules: current.modules,
          jobFlow: current.jobFlow,
          depositsOnNewJob: current.depositsOnNewJob,
        })
        expect(settings.repeatDefault).toEqual(current.repeatDefault)
        expect(settings.reminderRule).toEqual(current.reminderRule)
        expect(plan).toEqual(NO_CHANGES)
        // Small enough for the server to accept (convex/setup.ts checkAnswers).
        expect(answers.item?.fields.length ?? 0).toBeLessThanOrEqual(6)
        expect(answers.services?.length ?? 0).toBeLessThanOrEqual(MAX_SERVICES)
      }),
    )
  })

  it('renames, services and the item word made in Settings are what the wizard starts from', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      name: 'Груминг у дома - Ели',
      words: {
        ...defaultBusiness().words,
        item: { singular: 'Любимец', plural: 'Любимци', gender: 'm' },
      },
      modules: { ...defaultBusiness().modules, items: true, services: true },
      itemFields: ['Порода'],
      services: [{ name: 'Къпане', priceCents: 3500 }],
    }
    const { answers, settings, plan } = confirmUnchanged(current)
    expect(answers.businessName).toBe('Груминг у дома - Ели')
    expect(answers.item?.word.singular).toBe('Любимец')
    expect(answers.services).toEqual([{ name: 'Къпане', price: '35' }])
    expect(settings.name).toBe('Груминг у дома - Ели')
    expect(settings.words.item.singular).toBe('Любимец')
    expect(plan).toEqual(NO_CHANGES)
  })

  it('what the business cannot tell is not carried over: the import choice is asked again', () => {
    const answers = answersFromBusiness({ ...fresh(), setupDone: true })
    expect(answers).not.toHaveProperty('importFrom')
  })

  it('a repeat default and a reminder rule together both stay', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      repeatDefault: { every: 2, unit: 'week' },
      reminderRule: { months: 6 },
      modules: { ...defaultBusiness().modules, reminders: true },
    }
    const { settings, plan } = confirmUnchanged(current)
    expect(settings.repeatDefault).toEqual({ every: 2, unit: 'week' })
    expect(settings.reminderRule).toEqual({ months: 6 })
    expect(plan).toEqual(NO_CHANGES)
  })

  it('a reminders module switched off with its rule left on stays off', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      reminderRule: { months: 12 },
    }
    expect(confirmUnchanged(current).settings.modules.reminders).toBe(false)
  })

  it('the reminders module switched on without a rule stays on', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      modules: { ...defaultBusiness().modules, reminders: true },
    }
    expect(confirmUnchanged(current).settings.modules.reminders).toBe(true)
  })

  it('services kept while the Services module is off do not switch it on', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      services: [{ name: 'Къпане', priceCents: 3500 }],
    }
    const { answers, plan } = confirmUnchanged(current)
    expect(answers.services).toEqual([{ name: 'Къпане', price: '35' }])
    expect(plan.modulesOn).toEqual([])
  })

  it('a change of answer is still applied', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      reminderRule: { months: 6 },
      modules: { ...defaultBusiness().modules, reminders: true },
    }
    const answers = { ...answersFromBusiness(current), repeat: 'none' as const }
    const settings = settingsFromAnswers(answers, current)
    expect(settings.reminderRule).toBeUndefined()
    expect(settings.modules.reminders).toBe(false)
  })
})

describe('planSetup lists every change the apply makes', () => {
  const rerun = (): CurrentSetup => ({ ...fresh(), setupDone: true })

  it('the deposit switch', () => {
    const on = planSetup(rerun(), settingsFromAnswers({ deposits: true }))
    expect(on.depositsChange).toEqual({ to: true })
    const current = { ...rerun(), depositsOnNewJob: true }
    const off = planSetup(
      current,
      settingsFromAnswers({ deposits: false }, current),
    )
    expect(off.depositsChange).toEqual({ to: false })
    expect(
      planSetup(rerun(), settingsFromAnswers({})).depositsChange,
    ).toBeUndefined()
  })

  it('the job flow', () => {
    const plan = planSetup(rerun(), settingsFromAnswers({ flow: 'multi' }))
    expect(plan.flowChange).toEqual({ from: 'single', to: 'multi' })
    expect(
      planSetup(rerun(), settingsFromAnswers({ flow: 'single' })).flowChange,
    ).toBeUndefined()
  })

  it('the repeat default, turned on, changed and off', () => {
    const on = planSetup(
      rerun(),
      settingsFromAnswers({ repeat: 'schedule', repeatEvery: '2weeks' }),
    )
    expect(on.repeatChange).toEqual({ to: { every: 2, unit: 'week' } })
    const current = {
      ...rerun(),
      repeatDefault: { every: 1, unit: 'week' as const },
    }
    const month = planSetup(
      current,
      settingsFromAnswers(
        { repeat: 'schedule', repeatEvery: 'month' },
        current,
      ),
    )
    expect(month.repeatChange).toEqual({ to: { every: 1, unit: 'month' } })
    const off = planSetup(
      current,
      settingsFromAnswers({ repeat: 'none' }, current),
    )
    expect(off.repeatChange).toEqual({ to: null })
  })

  it('the reminder rule, turned on, changed and off', () => {
    const on = planSetup(
      rerun(),
      settingsFromAnswers({ repeat: 'months', reminderMonths: 6 }),
    )
    expect(on.reminderRuleChange).toEqual({ to: { months: 6 } })
    const current = { ...rerun(), reminderRule: { months: 6 } }
    const year = planSetup(
      current,
      settingsFromAnswers({ repeat: 'months', reminderMonths: 12 }, current),
    )
    expect(year.reminderRuleChange).toEqual({ to: { months: 12 } })
    const off = planSetup(
      current,
      settingsFromAnswers({ repeat: 'none' }, current),
    )
    expect(off.reminderRuleChange).toEqual({ to: null })
  })

  it('a service listed twice is not an update when each keeps its price', () => {
    const current: CurrentSetup = {
      ...rerun(),
      services: [
        { name: 'Къпане', priceCents: 3500 },
        { name: 'Къпане', priceCents: 5000 },
      ],
    }
    expect(confirmUnchanged(current).plan).toEqual(NO_CHANGES)
  })
})

describe('stagesAfter', () => {
  const names = (stages: Array<{ name: string }>) =>
    stages.map((stage) => stage.name)

  it('a first run on an empty business gets the flow’s stages', () => {
    const current = fresh()
    const plan = planSetup(current, settingsFromAnswers({ flow: 'multi' }))
    expect(names(stagesAfter(current, plan))).toEqual([
      'Запитване',
      'Оглед',
      'В работа',
      'Готово',
      'Отказано',
    ])
  })

  it('running setup again with the same flow keeps the stages as they are', () => {
    const current: CurrentSetup = {
      ...fresh(),
      setupDone: true,
      jobFlow: 'multi',
      stages: [
        { name: 'Приет', group: 'new' },
        { name: 'Изработка', group: 'in_progress' },
        { name: 'Готов', group: 'done' },
      ],
    }
    const { plan } = confirmUnchanged(current)
    expect(stagesAfter(current, plan)).toEqual(current.stages)
  })

  it('a flow that changes adds the missing stages at the end of their groups', () => {
    const current: CurrentSetup = { ...fresh(), setupDone: true, hasJobs: true }
    const plan = planSetup(
      current,
      settingsFromAnswers({ flow: 'multi' }, current),
    )
    expect(names(stagesAfter(current, plan))).toEqual([
      'Насрочено',
      'Запитване',
      'В работа',
      'Оглед',
      'Готово',
      'Отказано',
    ])
  })
})
