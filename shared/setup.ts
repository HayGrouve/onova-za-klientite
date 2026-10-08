import { parseMoney } from './money'
import { REPEAT_CHOICES } from './repeat'
import type { RepeatKey } from './repeat'
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

/** Fields suggested for an item the person names themselves: only ones that suit a dog as well as a property. */
export const OWN_ITEM_FIELDS = ['Описание', 'Бележка']

/** Setup step 6, "By schedule": the same intervals a Job offers (shared/repeat.ts). */
export const REPEAT_EVERY = REPEAT_CHOICES.map((choice) => choice.key)
export type RepeatEvery = RepeatKey

/** Setup step 6, "Every few months": a groomer's reminder is about 2 months, a service's a year. */
export const REMINDER_MONTHS = [1, 2, 3, 6, 12] as const

/** Settings → Reminders offers every setup delay, and two years. */
export const RULE_MONTHS = [...REMINDER_MONTHS, 24] as const

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

const REPEAT_DEFAULTS = Object.fromEntries(
  REPEAT_CHOICES.map(({ key, every, unit }) => [key, { every, unit }]),
) as Record<RepeatEvery, RepeatDefault>

function sameServices(
  a: Array<{ name: string; priceCents: number }>,
  b: Array<{ name: string; priceCents: number }>,
) {
  return (
    a.length === b.length &&
    a.every(
      (service, index) =>
        service.name === b[index].name &&
        service.priceCents === b[index].priceCents,
    )
  )
}

type RepeatAnswer = Pick<
  SetupAnswers,
  'repeat' | 'repeatEvery' | 'reminderMonths'
>

/** The repeat answer that describes a business as it is (it can hold both a repeat default and a reminder rule). */
function repeatAnswerOf(business: BusinessDefaults): RepeatAnswer {
  if (business.reminderRule) {
    return { repeat: 'months', reminderMonths: business.reminderRule.months }
  }
  const { repeatDefault } = business
  if (repeatDefault) {
    const every = Object.entries(REPEAT_DEFAULTS).find(
      ([, value]) =>
        value.every === repeatDefault.every &&
        value.unit === repeatDefault.unit,
    )?.[0] as RepeatEvery | undefined
    return { repeat: 'schedule', repeatEvery: every ?? 'week' }
  }
  return { repeat: 'none' }
}

function sameRepeatAnswer(a: RepeatAnswer, b: RepeatAnswer) {
  return (
    a.repeat === b.repeat &&
    (a.repeat !== 'schedule' ||
      (a.repeatEvery ?? 'week') === (b.repeatEvery ?? 'week')) &&
    (a.repeat !== 'months' ||
      (a.reminderMonths ?? 12) === (b.reminderMonths ?? 12))
  )
}

/** What setup starts from: the defaults on a first run, the business as it is when setup runs again. */
type SetupBase = BusinessDefaults & {
  services?: Array<{ name: string; priceCents: number }>
}

/**
 * What the answers set. Skipped answers keep `base`, and so does an answer
 * that says what `base` already is, so confirming a re-run unchanged changes
 * nothing, even where a business holds more than one answer can say.
 */
export function settingsFromAnswers(
  answers: SetupAnswers,
  base: SetupBase = defaultBusiness(),
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

  // One question sets the repeat default, the reminder rule and the module.
  const repeat = answers.repeat
  const keepRepeat =
    repeat === undefined || sameRepeatAnswer(answers, repeatAnswerOf(base))
  const repeatDefault = keepRepeat
    ? base.repeatDefault
    : repeat === 'schedule'
      ? REPEAT_DEFAULTS[answers.repeatEvery ?? 'week']
      : undefined
  const reminderRule = keepRepeat
    ? base.reminderRule
    : repeat === 'months'
      ? { months: answers.reminderMonths ?? 12 }
      : undefined
  // The list as it was filled in from the business is not an answer to change.
  const keepServices =
    answers.services === undefined ||
    (base.services !== undefined &&
      sameServices(services, base.services.slice(0, MAX_SERVICES)))

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
      reminders: keepRepeat ? base.modules.reminders : repeat === 'months',
      services: keepServices ? base.modules.services : services.length > 0,
    },
  }
}

/** Which inputs the new-job form shows, in order (prototype 1 and 2). */
export type FormField =
  'client' | 'item' | 'title' | 'price' | 'deposit' | 'when' | 'due' | 'repeat'

export function jobFormFields(
  settings: Pick<
    SetupSettings,
    'item' | 'depositsOnNewJob' | 'jobFlow' | 'repeatDefault'
  >,
): FormField[] {
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
  flowChange?: { from: JobFlow; to: JobFlow }
  /** The new "deposit on a new job" switch, when it changes. */
  depositsChange?: { to: boolean }
  /** The new repeat default (null: none), when it changes. */
  repeatChange?: { to: RepeatDefault | null }
  /** The new reminder rule (null: none), when it changes. */
  reminderRuleChange?: { to: { months: number } | null }
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('bg') === b.trim().toLocaleLowerCase('bg')

/**
 * What applying the settings changes, every part of it. Safe-change rules:
 * words are renamed, modules switched (hidden, never deleted), stages and item
 * fields only added, services merged by name. Nothing is ever deleted.
 */
export function planSetup(
  current: CurrentSetup,
  settings: SetupSettings,
): SetupPlan {
  const sameStages =
    current.stages.length === settings.stages.length &&
    current.stages.every(
      (stage, index) =>
        sameName(stage.name, settings.stages[index].name) &&
        stage.group === settings.stages[index].group,
    )
  const replaceStages = !current.setupDone && !current.hasJobs && !sameStages
  // Custom stages stay as they are unless the answer about the job flow changed.
  const flowChanged = settings.jobFlow !== current.jobFlow
  const stagesToAdd = replaceStages
    ? settings.stages
    : !flowChanged
      ? []
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
    // Two services may share a name: one at this price is already right.
    const existing =
      current.services.find(
        (item) =>
          sameName(item.name, service.name) &&
          item.priceCents === service.priceCents,
      ) ?? current.services.find((item) => sameName(item.name, service.name))
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
    ...(flowChanged
      ? { flowChange: { from: current.jobFlow, to: settings.jobFlow } }
      : {}),
    ...(settings.depositsOnNewJob !== current.depositsOnNewJob
      ? { depositsChange: { to: settings.depositsOnNewJob } }
      : {}),
    ...(!sameRepeatDefault(current.repeatDefault, settings.repeatDefault)
      ? { repeatChange: { to: settings.repeatDefault ?? null } }
      : {}),
    ...(current.reminderRule?.months !== settings.reminderRule?.months
      ? { reminderRuleChange: { to: settings.reminderRule ?? null } }
      : {}),
  }
}

function sameRepeatDefault(a?: RepeatDefault, b?: RepeatDefault) {
  return a?.every === b?.every && a?.unit === b?.unit
}

/**
 * The stages the business has once the plan is applied: all it has now, and
 * the plan's new ones at the end of their group (as `insertStage` places them).
 */
export function stagesAfter(
  current: CurrentSetup,
  plan: SetupPlan,
): Array<{ name: string; group: StageGroup }> {
  if (plan.replaceStages) {
    return plan.stagesToAdd.map(({ name, group }) => ({ name, group }))
  }
  const stages = [...current.stages]
  for (const { name, group } of plan.stagesToAdd) {
    let at = stages.length
    for (let index = stages.length - 1; index >= 0; index--) {
      if (stages[index].group === group) {
        at = index + 1
        break
      }
    }
    stages.splice(at, 0, { name, group })
  }
  return stages
}

function formatPrice(cents: number) {
  const whole = Math.trunc(cents / 100)
  const rest = Math.abs(cents % 100)
  return rest === 0
    ? String(whole)
    : `${whole},${String(rest).padStart(2, '0')}`
}

/** The most item fields setup stores in its answers (convex/setup.ts checkAnswers). */
const MAX_ITEM_FIELDS = 6

/**
 * Answers that reproduce the business as it is now, whatever was changed in
 * Settings since: "Run setup again" starts here, so confirming changes nothing.
 * The one thing a business cannot tell is where its clients come from, which
 * setup asks again each time.
 */
export function answersFromBusiness(current: CurrentSetup): SetupAnswers {
  return {
    businessName: current.name,
    jobWord: current.words.job,
    flow: current.jobFlow,
    hasItem: current.modules.items,
    ...(current.modules.items
      ? {
          item: {
            word: current.words.item,
            // Setup edits the first few; the rest stay as Settings has them.
            fields: current.itemFields.slice(0, MAX_ITEM_FIELDS),
          },
        }
      : {}),
    deposits: current.depositsOnNewJob,
    costs: current.modules.costs,
    ...repeatAnswerOf(current),
    ...(current.services.length > 0
      ? {
          services: current.services.slice(0, MAX_SERVICES).map((service) => ({
            name: service.name,
            price: formatPrice(service.priceCents),
          })),
        }
      : {}),
  }
}
