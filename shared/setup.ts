import { parseMoney } from './money'
import { stagesFor } from './stages'
import type { JobFlow, StageDraft, StageGroup } from './stages'
import { DEFAULT_WORDS, guessPlural } from './words'
import type { Word, Words } from './words'

export type Modules = {
  appointments: boolean
  costs: boolean
  items: boolean
  reminders: boolean
  services: boolean
}

export const MODULE_KEYS = [
  'appointments',
  'costs',
  'items',
  'reminders',
  'services',
] as const satisfies ReadonlyArray<keyof Modules>

/** What a business gets when setup is skipped entirely (Q4). */
export const DEFAULT_MODULES: Modules = {
  appointments: true,
  costs: true,
  items: false,
  reminders: false,
  services: false,
}

export type RepeatDefault = { every: number; unit: 'week' | 'month' }

export type BusinessDefaults = {
  name: string
  words: Words
  modules: Modules
  jobFlow: JobFlow
  depositsOnNewJob: boolean
  repeatDefault?: RepeatDefault
  reminderRule?: { months: number }
}

export const DEFAULT_BUSINESS_NAME = 'Моят бизнес'

export function defaultBusiness(): BusinessDefaults {
  return {
    name: DEFAULT_BUSINESS_NAME,
    words: {
      client: { ...DEFAULT_WORDS.client },
      job: { ...DEFAULT_WORDS.job },
      item: { ...DEFAULT_WORDS.item },
      appointment: { ...DEFAULT_WORDS.appointment },
    },
    modules: { ...DEFAULT_MODULES },
    jobFlow: 'single',
    depositsOnNewJob: false,
  }
}

// ── Wizard answers ─────────────────────────────────────────────────────

/** Setup step 2: the five offered words. Gender is stored for later (Q10). */
export const JOB_WORDS: Word[] = [
  { singular: 'Поръчка', plural: 'Поръчки', gender: 'f' },
  { singular: 'Задача', plural: 'Задачи', gender: 'f' },
  { singular: 'Проект', plural: 'Проекти', gender: 'm' },
  { singular: 'Посещение', plural: 'Посещения', gender: 'n' },
  { singular: 'Ремонт', plural: 'Ремонти', gender: 'm' },
]

export type ItemKind = { word: Word; fields: string[] }

/** Setup step 4: suggested things a client owns, each with 2–3 suggested fields. */
export const ITEM_KINDS: ItemKind[] = [
  {
    word: { singular: 'Автомобил', plural: 'Автомобили', gender: 'm' },
    fields: ['Рег. номер', 'Марка и модел', 'Пробег'],
  },
  {
    word: { singular: 'Уред', plural: 'Уреди', gender: 'm' },
    fields: ['Марка и модел', 'Сериен номер'],
  },
  {
    word: { singular: 'Климатик', plural: 'Климатици', gender: 'm' },
    fields: ['Модел', 'Помещение'],
  },
  {
    word: { singular: 'Имот', plural: 'Имоти', gender: 'm' },
    fields: ['Адрес', 'Площ'],
  },
  {
    word: { singular: 'Животно', plural: 'Животни', gender: 'n' },
    fields: ['Порода', 'Характер'],
  },
]

/** Fields suggested for an item the person names themselves. */
export const OWN_ITEM_FIELDS = ['Модел', 'Бележка']

export const REPEAT_EVERY = ['week', '2weeks', 'month'] as const
export type RepeatEvery = (typeof REPEAT_EVERY)[number]

export const REMINDER_MONTHS = [3, 6, 12] as const

export const MAX_SERVICES = 8

/** Raw wizard answers. `undefined` means skipped, so the current value or a default applies. */
export type SetupAnswers = {
  businessName?: string
  jobWord?: Word
  flow?: JobFlow
  hasItem?: boolean
  item?: ItemKind
  deposits?: boolean
  costs?: boolean
  repeat?: 'none' | 'schedule' | 'months'
  repeatEvery?: RepeatEvery
  reminderMonths?: number
  services?: Array<{ name: string; price: string }>
  importFrom?: 'phone' | 'excel' | 'later'
}

export const SETUP_STEPS = [
  'name',
  'jobWord',
  'flow',
  'item',
  'money',
  'repeat',
  'services',
  'import',
] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

/** Removes a step's answers so its default applies again ("Пропусни"). */
export function clearStep(
  step: SetupStep,
  answers: SetupAnswers,
): SetupAnswers {
  const keys: Record<SetupStep, Array<keyof SetupAnswers>> = {
    name: ['businessName'],
    jobWord: ['jobWord'],
    flow: ['flow'],
    item: ['hasItem', 'item'],
    money: ['deposits', 'costs'],
    repeat: ['repeat', 'repeatEvery', 'reminderMonths'],
    services: ['services'],
    import: ['importFrom'],
  }
  const next = { ...answers }
  for (const key of keys[step]) delete next[key]
  return next
}

// ── Settings ───────────────────────────────────────────────────────────

export type SetupSettings = BusinessDefaults & {
  stages: StageDraft[]
  item: ItemKind | null
  services: Array<{ name: string; priceCents: number }>
}

function completeWord(word: Word): Word | null {
  const singular = word.singular.trim()
  if (!singular) return null
  return {
    singular,
    plural: word.plural.trim() || guessPlural(singular),
    gender: word.gender,
  }
}

const REPEAT_DEFAULTS: Record<RepeatEvery, RepeatDefault> = {
  week: { every: 1, unit: 'week' },
  '2weeks': { every: 2, unit: 'week' },
  month: { every: 1, unit: 'month' },
}

/**
 * What the answers set. Skipped answers keep `base`: the defaults on a first
 * run, the business as it is when setup runs again.
 */
export function settingsFromAnswers(
  answers: SetupAnswers,
  base: BusinessDefaults = defaultBusiness(),
): SetupSettings {
  const jobFlow = answers.flow ?? base.jobFlow
  const jobWord =
    (answers.jobWord && completeWord(answers.jobWord)) ?? base.words.job
  const itemWord = answers.item && completeWord(answers.item.word)
  const item =
    answers.hasItem === false
      ? null
      : answers.hasItem && answers.item && itemWord
        ? {
            word: itemWord,
            fields: [
              ...new Set(
                answers.item.fields
                  .map((field) => field.trim())
                  .filter(Boolean),
              ),
            ],
          }
        : answers.hasItem === undefined && base.modules.items
          ? { word: base.words.item, fields: [] }
          : null

  const services = (answers.services ?? [])
    .map((service) => ({
      name: service.name.trim(),
      priceCents: Math.max(parseMoney(service.price) ?? 0, 0),
    }))
    .filter((service) => service.name)
    .slice(0, MAX_SERVICES)

  const repeat = answers.repeat
  const repeatDefault =
    repeat === undefined
      ? base.repeatDefault
      : repeat === 'schedule'
        ? REPEAT_DEFAULTS[answers.repeatEvery ?? 'week']
        : undefined
  const reminderRule =
    repeat === undefined
      ? base.reminderRule
      : repeat === 'months'
        ? { months: answers.reminderMonths ?? 12 }
        : undefined

  return {
    name: answers.businessName?.trim() || base.name,
    words: {
      ...base.words,
      job: jobWord,
      item: item?.word ?? base.words.item,
    },
    jobFlow,
    stages: stagesFor(jobFlow),
    item,
    depositsOnNewJob: answers.deposits ?? base.depositsOnNewJob,
    repeatDefault,
    reminderRule,
    services,
    modules: {
      // Q4: a one-visit business's "when" is an appointment, so it stays on.
      appointments: base.modules.appointments,
      items: item !== null,
      costs: answers.costs ?? base.modules.costs,
      reminders:
        repeat === undefined ? base.modules.reminders : repeat === 'months',
      services:
        answers.services === undefined
          ? base.modules.services
          : services.length > 0,
    },
  }
}

/** Which inputs the new-job form shows, in order (prototype 1 and 2). */
export type FormField =
  'client' | 'item' | 'title' | 'price' | 'deposit' | 'when' | 'due' | 'repeat'

export function jobFormFields(settings: SetupSettings): FormField[] {
  const fields: FormField[] = ['client']
  if (settings.item) fields.push('item')
  fields.push('title', 'price')
  if (settings.depositsOnNewJob) fields.push('deposit')
  fields.push(settings.jobFlow === 'single' ? 'when' : 'due')
  if (settings.repeatDefault) fields.push('repeat')
  return fields
}

// ── Applying (Q12) ─────────────────────────────────────────────────────

/** The business as setup finds it. */
export type CurrentSetup = BusinessDefaults & {
  stages: Array<{ name: string; group: StageGroup }>
  /** Names of the active item fields. */
  itemFields: string[]
  services: Array<{ name: string; priceCents: number }>
  hasJobs: boolean
  setupDone: boolean
}

export type SetupPlan = {
  /** First run on an empty business: its default stages are swapped for the flow's. */
  replaceStages: boolean
  stagesToAdd: StageDraft[]
  fieldsToAdd: string[]
  servicesToAdd: Array<{ name: string; priceCents: number }>
  servicesToUpdate: Array<{ name: string; priceCents: number }>
  wordChanges: Array<{ key: keyof Words; from: string; to: string }>
  modulesOn: Array<keyof Modules>
  modulesOff: Array<keyof Modules>
  nameChange?: { from: string; to: string }
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('bg') === b.trim().toLocaleLowerCase('bg')

/**
 * What applying the settings changes. Safe-change rules: words are renamed,
 * modules switched (hidden, never deleted), stages and item fields only
 * added, services merged by name. Nothing is ever deleted.
 */
export function planSetup(
  current: CurrentSetup,
  settings: SetupSettings,
): SetupPlan {
  const replaceStages = !current.setupDone && !current.hasJobs
  const stagesToAdd = replaceStages
    ? settings.stages
    : settings.stages.filter(
        (stage) =>
          !current.stages.some((existing) =>
            sameName(existing.name, stage.name),
          ),
      )

  const fieldsToAdd = (settings.item?.fields ?? []).filter(
    (field) =>
      !current.itemFields.some((existing) => sameName(existing, field)),
  )

  const servicesToAdd: SetupPlan['servicesToAdd'] = []
  const servicesToUpdate: SetupPlan['servicesToUpdate'] = []
  for (const service of settings.services) {
    const existing = current.services.find((item) =>
      sameName(item.name, service.name),
    )
    if (!existing) servicesToAdd.push(service)
    else if (existing.priceCents !== service.priceCents) {
      servicesToUpdate.push({
        name: existing.name,
        priceCents: service.priceCents,
      })
    }
  }

  const wordChanges: SetupPlan['wordChanges'] = []
  for (const key of ['client', 'job', 'item', 'appointment'] as const) {
    const from = current.words[key]
    const to = settings.words[key]
    if (from.singular !== to.singular || from.plural !== to.plural) {
      wordChanges.push({ key, from: from.singular, to: to.singular })
    }
  }

  return {
    replaceStages,
    stagesToAdd,
    fieldsToAdd,
    servicesToAdd,
    servicesToUpdate,
    wordChanges,
    modulesOn: MODULE_KEYS.filter(
      (key) => settings.modules[key] && !current.modules[key],
    ),
    modulesOff: MODULE_KEYS.filter(
      (key) => !settings.modules[key] && current.modules[key],
    ),
    ...(settings.name !== current.name
      ? { nameChange: { from: current.name, to: settings.name } }
      : {}),
  }
}

function formatPrice(cents: number) {
  const whole = Math.trunc(cents / 100)
  const rest = Math.abs(cents % 100)
  return rest === 0
    ? String(whole)
    : `${whole},${String(rest).padStart(2, '0')}`
}

/** Answers that reproduce the business as it is, for "Run setup again" when none were stored. */
export function answersFromBusiness(current: CurrentSetup): SetupAnswers {
  const repeatEvery = current.repeatDefault
    ? (Object.entries(REPEAT_DEFAULTS).find(
        ([, value]) =>
          value.every === current.repeatDefault?.every &&
          value.unit === current.repeatDefault.unit,
      )?.[0] as RepeatEvery | undefined)
    : undefined
  return {
    businessName: current.name,
    jobWord: current.words.job,
    flow: current.jobFlow,
    hasItem: current.modules.items,
    ...(current.modules.items
      ? { item: { word: current.words.item, fields: current.itemFields } }
      : {}),
    deposits: current.depositsOnNewJob,
    costs: current.modules.costs,
    ...(current.reminderRule
      ? {
          repeat: 'months' as const,
          reminderMonths: current.reminderRule.months,
        }
      : current.repeatDefault
        ? { repeat: 'schedule' as const, repeatEvery: repeatEvery ?? 'week' }
        : {}),
    ...(current.services.length > 0
      ? {
          services: current.services.map((service) => ({
            name: service.name,
            price: formatPrice(service.priceCents),
          })),
        }
      : {}),
  }
}
