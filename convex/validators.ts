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
