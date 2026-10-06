import { v } from 'convex/values'
import { STAGE_COLORS, STAGE_GROUPS } from '../shared/stages'

export const vWord = v.object({
  singular: v.string(),
  plural: v.string(),
  gender: v.union(v.literal('m'), v.literal('f'), v.literal('n')),
})

export const vWords = v.object({
  client: vWord,
  job: vWord,
  item: vWord,
  appointment: vWord,
})

export const vModules = v.object({
  appointments: v.boolean(),
  costs: v.boolean(),
  items: v.boolean(),
  reminders: v.boolean(),
  services: v.boolean(),
})

export const vJobFlow = v.union(v.literal('single'), v.literal('multi'))

export const vStageGroup = v.union(
  ...STAGE_GROUPS.map((group) => v.literal(group)),
)

export const vStageColor = v.union(
  ...STAGE_COLORS.map((color) => v.literal(color)),
)

export const vRole = v.union(
  v.literal('owner'),
  v.literal('manager'),
  v.literal('worker'),
)

export const vFieldTarget = v.union(
  v.literal('client'),
  v.literal('job'),
  v.literal('item'),
)

export const vFieldType = v.union(
  v.literal('text'),
  v.literal('longText'),
  v.literal('number'),
  v.literal('money'),
  v.literal('date'),
  v.literal('yesNo'),
  v.literal('choice'),
  v.literal('photo'),
)

/** An extra field value. Choice stores the option id; photo stores a files id. */
export const vFieldValue = v.union(v.string(), v.number(), v.boolean())

export const vExtra = v.record(v.string(), vFieldValue)

export const vConsent = v.object({ given: v.boolean(), at: v.number() })

export const vChannel = v.union(
  v.literal('phone'),
  v.literal('viber'),
  v.literal('sms'),
  v.literal('email'),
)

export const vPaymentMethod = v.union(
  v.literal('cash'),
  v.literal('bank'),
  v.literal('card'),
  v.literal('other'),
)

export const vJobLine = v.object({
  id: v.string(),
  description: v.string(),
  quantity: v.number(),
  unitPriceCents: v.number(),
  serviceId: v.optional(v.id('services')),
})

export const vRepeatUnit = v.union(v.literal('week'), v.literal('month'))

/** Closed list of activity events. Add a literal here before logging a new kind. */
export const ACTIVITY_TYPES = [
  'job.created',
  'job.edited',
  'job.stageChanged',
  'job.linesChanged',
  'job.itemsChanged',
  'job.writtenOff',
  'job.writeOffRemoved',
  'job.cancelled',
  'payment.added',
  'payment.removed',
  'credit.used',
  'cost.added',
  'cost.edited',
  'cost.removed',
  'client.created',
  'client.edited',
  'item.created',
  'item.edited',
  'item.moved',
  'stage.added',
  'stage.edited',
  'stage.removed',
  'stages.reordered',
  'field.added',
  'field.edited',
  'field.archived',
  'field.restored',
  'setup.applied',
  'appointment.added',
  'appointment.changed',
  'appointment.cancelled',
  'file.added',
  'file.removed',
] as const

export const vActivityType = v.union(
  ...ACTIVITY_TYPES.map((type) => v.literal(type)),
)

/** Small, typed details of an event: what changed from what to what. */
export const vActivityData = v.object({
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  amountCents: v.optional(v.number()),
  note: v.optional(v.string()),
  name: v.optional(v.string()),
  fromId: v.optional(v.string()),
  toId: v.optional(v.string()),
})

/** Setup wizard answers, as stored for "Run setup again" (shared/setup.ts). */
export const vSetupAnswers = v.object({
  businessName: v.optional(v.string()),
  jobWord: v.optional(vWord),
  flow: v.optional(vJobFlow),
  hasItem: v.optional(v.boolean()),
  item: v.optional(v.object({ word: vWord, fields: v.array(v.string()) })),
  deposits: v.optional(v.boolean()),
  costs: v.optional(v.boolean()),
  repeat: v.optional(
    v.union(v.literal('none'), v.literal('schedule'), v.literal('months')),
  ),
  repeatEvery: v.optional(
    v.union(v.literal('week'), v.literal('2weeks'), v.literal('month')),
  ),
  reminderMonths: v.optional(v.number()),
  services: v.optional(
    v.array(v.object({ name: v.string(), price: v.string() })),
  ),
  importFrom: v.optional(
    v.union(v.literal('phone'), v.literal('excel'), v.literal('later')),
  ),
})
