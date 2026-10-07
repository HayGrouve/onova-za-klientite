import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { planSetup, settingsFromAnswers } from '../shared/setup'
import type { CurrentSetup, SetupAnswers } from '../shared/setup'
import { isValidWord } from '../shared/words'
import { logActivity } from './lib/activity'
import { businessMutation, businessQuery, requireRole } from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import { businessStages, insertStage } from './lib/insertStage'
import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import {
  vSetupAnswers,
  vJobFlow,
  vModules,
  vStageGroup,
  vWords,
} from './validators'

async function loadCurrent(
  ctx: QueryCtx & { business: Doc<'businesses'> },
): Promise<CurrentSetup> {
  const business = ctx.business
  const stages = await ctx.db
    .query('stages')
    .withIndex('by_business_order', (q) => q.eq('businessId', business._id))
    .collect()
  const itemFields = await ctx.db
    .query('fields')
    .withIndex('by_business_target_order', (q) =>
      q.eq('businessId', business._id).eq('target', 'item'),
    )
    .collect()
  const services = await ctx.db
    .query('services')
    .withIndex('by_business_order', (q) => q.eq('businessId', business._id))
    .collect()
  const anyJob = await ctx.db
    .query('jobs')
    .withIndex('by_business_group_due', (q) => q.eq('businessId', business._id))
    .first()
  return {
    name: business.name,
    words: business.words,
    modules: business.modules,
    jobFlow: business.jobFlow,
    depositsOnNewJob: business.depositsOnNewJob,
    repeatDefault: business.repeatDefault,
    reminderRule: business.reminderRule,
    stages: stages.map(({ name, group }) => ({ name, group })),
    itemFields: itemFields
      .filter((field) => field.archivedAt === undefined)
      .map((field) => field.name),
    services: services
      .filter((service) => service.archivedAt === undefined)
      .map(({ name, priceCents }) => ({ name, priceCents })),
    hasJobs: anyJob !== null,
    setupDone: business.setup.completedAt !== undefined,
  }
}

const vCurrent = v.object({
  name: v.string(),
  words: vWords,
  modules: vModules,
  jobFlow: vJobFlow,
  depositsOnNewJob: v.boolean(),
  repeatDefault: v.optional(
    v.object({
      every: v.number(),
      unit: v.union(v.literal('week'), v.literal('month')),
    }),
  ),
  reminderRule: v.optional(v.object({ months: v.number() })),
  stages: v.array(v.object({ name: v.string(), group: vStageGroup })),
  itemFields: v.array(v.string()),
  services: v.array(v.object({ name: v.string(), priceCents: v.number() })),
  hasJobs: v.boolean(),
  setupDone: v.boolean(),
})

/** The business as setup finds it, and the answers it was last set up with. */
export const current = businessQuery({
  args: {},
  returns: v.object({
    current: vCurrent,
    answers: v.union(vSetupAnswers, v.null()),
  }),
  handler: async (ctx) => ({
    current: await loadCurrent(ctx),
    answers: ctx.business.setup.answers ?? null,
  }),
})

function checkAnswers(answers: Infer<typeof vSetupAnswers>): SetupAnswers {
  const text = (value: string | undefined, max: number) =>
    value !== undefined && value.trim().length > max
      ? fail('invalid', { field: 'setup' })
      : value
  text(answers.businessName, 120)
  for (const word of [answers.jobWord, answers.item?.word]) {
    // An empty own word means "not answered yet"; settings fall back to the default.
    if (
      word?.singular.trim() &&
      !isValidWord({ ...word, plural: word.plural || word.singular })
    ) {
      fail('invalid', { field: 'word' })
    }
  }
  if ((answers.item?.fields.length ?? 0) > 6)
    fail('invalid', { field: 'fields' })
  for (const field of answers.item?.fields ?? []) text(field, 60)
  if ((answers.services?.length ?? 0) > 20)
    fail('invalid', { field: 'services' })
  for (const service of answers.services ?? []) {
    text(service.name, 60)
    text(service.price, 20)
  }
  const months = answers.reminderMonths
  if (
    months !== undefined &&
    (!Number.isInteger(months) || months < 1 || months > 60)
  ) {
    fail('invalid', { field: 'reminderMonths' })
  }
  return answers
}

async function applyStages(
  ctx: BusinessMutationCtx,
  plan: ReturnType<typeof planSetup>,
) {
  if (plan.replaceStages) {
    // Only on a first run with no jobs: nothing points at these stages yet.
    for (const stage of await businessStages(ctx))
      await ctx.db.delete('stages', stage._id)
    for (const [order, stage] of plan.stagesToAdd.entries()) {
      await ctx.db.insert('stages', {
        businessId: ctx.business._id,
        ...stage,
        order,
        visibleToClient: false,
      })
    }
    return
  }
  for (const stage of plan.stagesToAdd) await insertStage(ctx, stage)
}

async function applyItemFields(ctx: BusinessMutationCtx, names: string[]) {
  const fields = await ctx.db
    .query('fields')
    .withIndex('by_business_target_order', (q) =>
      q.eq('businessId', ctx.business._id).eq('target', 'item'),
    )
    .collect()
  let order = (fields.at(-1)?.order ?? -1) + 1
  for (const name of names) {
    const archived = fields.find(
      (field) =>
        field.archivedAt !== undefined &&
        field.name.toLocaleLowerCase('bg') === name.toLocaleLowerCase('bg'),
    )
    if (archived) {
      await ctx.db.patch('fields', archived._id, { archivedAt: undefined })
      continue
    }
    await ctx.db.insert('fields', {
      businessId: ctx.business._id,
      target: 'item',
      name,
      type: 'text',
      showInList: true,
      order: order++,
      visibleToClient: false,
    })
  }
}

async function applyServices(
  ctx: BusinessMutationCtx,
  plan: ReturnType<typeof planSetup>,
) {
  const services = await ctx.db
    .query('services')
    .withIndex('by_business_order', (q) => q.eq('businessId', ctx.business._id))
    .collect()
  for (const update of plan.servicesToUpdate) {
    const service = services.find(
      (item) => item.archivedAt === undefined && item.name === update.name,
    )
    if (service)
      await ctx.db.patch('services', service._id, {
        priceCents: update.priceCents,
      })
  }
  let order = (services.at(-1)?.order ?? -1) + 1
  for (const service of plan.servicesToAdd) {
    await ctx.db.insert('services', {
      businessId: ctx.business._id,
      ...service,
      order: order++,
    })
  }
}

/**
 * Applies setup answers in one mutation, through the safe-change rules (Q12):
 * words renamed, modules switched, stages, item fields and services only
 * added or updated. Nothing that holds data is deleted.
 */
export const apply = businessMutation({
  args: { answers: vSetupAnswers },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const answers = checkAnswers(args.answers)
    const before = await loadCurrent(ctx)
    const settings = settingsFromAnswers(answers, before)
    const plan = planSetup(before, settings)

    await ctx.db.patch('businesses', ctx.business._id, {
      name: settings.name,
      words: settings.words,
      modules: settings.modules,
      jobFlow: settings.jobFlow,
      depositsOnNewJob: settings.depositsOnNewJob,
      repeatDefault: settings.repeatDefault,
      reminderRule: settings.reminderRule,
      setup: { answers, completedAt: Date.now() },
    })
    await applyStages(ctx, plan)
    await applyItemFields(ctx, plan.fieldsToAdd)
    await applyServices(ctx, plan)
    await logActivity(ctx, {
      type: 'setup.applied',
      data: { from: before.name, to: settings.name },
    })
    return null
  },
})
