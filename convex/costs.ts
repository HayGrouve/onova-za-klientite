import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import { insertCost, patchCost, removeCost } from './lib/ledger'
import { calendarDate, cents, optionalText, requiredText } from './lib/validate'

/** A cost on a job, or a general one (rent, fuel, tools) when there is no job. */
export const add = businessMutation({
  args: {
    jobId: v.optional(v.id('jobs')),
    amountCents: v.number(),
    date: v.string(),
    label: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.id('costs'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = args.jobId ? await getOwned(ctx, 'jobs', args.jobId) : null
    const amountCents = cents(args.amountCents, 'amountCents')
    const label = requiredText(args.label, 'label', 100)
    const costId = await insertCost(ctx, {
      businessId: ctx.business._id,
      jobId: job?._id,
      amountCents,
      date: calendarDate(args.date, 'date'),
      label,
      note: optionalText(args.note, 'note', 1000),
    })
    await logActivity(ctx, {
      type: 'cost.added',
      costId,
      jobId: job?._id,
      clientId: job?.clientId,
      data: { amountCents, name: label },
    })
    return costId
  },
})

export const update = businessMutation({
  args: {
    costId: v.id('costs'),
    amountCents: v.optional(v.number()),
    date: v.optional(v.string()),
    label: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const cost = await getOwned(ctx, 'costs', args.costId)
    const patch: Partial<Doc<'costs'>> = {}
    if (args.amountCents !== undefined)
      patch.amountCents = cents(args.amountCents, 'amountCents')
    if (args.date !== undefined) patch.date = calendarDate(args.date, 'date')
    if (args.label !== undefined)
      patch.label = requiredText(args.label, 'label', 100)
    if (args.note !== undefined)
      patch.note = optionalText(args.note, 'note', 1000)
    await patchCost(ctx, cost, patch)
    const job = cost.jobId ? await ctx.db.get('jobs', cost.jobId) : null
    await logActivity(ctx, {
      type: 'cost.edited',
      costId: cost._id,
      jobId: cost.jobId,
      clientId: job?.clientId,
      data: { amountCents: patch.amountCents ?? cost.amountCents },
    })
    return null
  },
})

export const remove = businessMutation({
  args: { costId: v.id('costs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const cost = await getOwned(ctx, 'costs', args.costId)
    await removeCost(ctx, cost)
    const job = cost.jobId ? await ctx.db.get('jobs', cost.jobId) : null
    await logActivity(ctx, {
      type: 'cost.removed',
      jobId: cost.jobId,
      clientId: job?.clientId,
      data: { amountCents: cost.amountCents, name: cost.label },
    })
    return null
  },
})
