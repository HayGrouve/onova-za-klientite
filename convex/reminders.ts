import { v } from 'convex/values'
import { isValidDate } from '../shared/dates'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import { requiredText } from './lib/validate'

/**
 * A follow-up date with a note, linked to a client, a job or an item. The
 * reminder rule (Q5) only pre-fills this; the person decides to add it.
 */
export const add = businessMutation({
  args: {
    date: v.string(),
    note: v.string(),
    clientId: v.optional(v.id('clients')),
    jobId: v.optional(v.id('jobs')),
    itemId: v.optional(v.id('items')),
    source: v.optional(v.union(v.literal('manual'), v.literal('rule'))),
  },
  returns: v.id('reminders'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    if (!isValidDate(args.date)) fail('invalid', { field: 'date' })
    const job = args.jobId ? await getOwned(ctx, 'jobs', args.jobId) : null
    const item = args.itemId ? await getOwned(ctx, 'items', args.itemId) : null
    const clientId = args.clientId ?? job?.clientId ?? item?.clientId
    const client = clientId ? await getOwned(ctx, 'clients', clientId) : null
    // The rule suggests a follow-up with someone: not with the built-in No client.
    if (args.source === 'rule' && (!client || client.isNoClient)) {
      fail('client.noClient')
    }
    if (job && clientId && job.clientId !== clientId) fail('job.otherClient')
    const note = requiredText(args.note, 'note', 300)
    const reminderId = await ctx.db.insert('reminders', {
      businessId: ctx.business._id,
      date: args.date,
      note,
      clientId,
      jobId: job?._id,
      itemId: item?._id,
      source: args.source ?? 'manual',
      status: 'open',
    })
    await logActivity(ctx, {
      type: 'reminder.added',
      clientId,
      jobId: job?._id,
      itemId: item?._id,
      data: { to: args.date, note },
    })
    return reminderId
  },
})

/** Done or dismissed. Closed reminders stay in the history. */
export const close = businessMutation({
  args: {
    reminderId: v.id('reminders'),
    status: v.union(v.literal('done'), v.literal('dismissed')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const reminder = await getOwned(ctx, 'reminders', args.reminderId)
    if (reminder.status !== 'open') return null
    await ctx.db.patch('reminders', reminder._id, {
      status: args.status,
      closedAt: Date.now(),
    })
    await logActivity(ctx, {
      type: 'reminder.closed',
      clientId: reminder.clientId,
      jobId: reminder.jobId,
      itemId: reminder.itemId,
      data: { to: args.status, note: reminder.note },
    })
    return null
  },
})

const vOpenReminders = v.array(
  v.object({
    _id: v.id('reminders'),
    date: v.string(),
    note: v.string(),
    source: v.union(v.literal('manual'), v.literal('rule')),
    jobId: v.optional(v.id('jobs')),
    itemId: v.optional(v.id('items')),
  }),
)

/** The open ones, soonest first, as the lists show them. */
function openReminders(reminders: Array<Doc<'reminders'>>) {
  return reminders
    .filter((reminder) => reminder.status === 'open')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ _id, date, note, source, jobId, itemId }) => ({
      _id,
      date,
      note,
      source,
      jobId,
      itemId,
    }))
}

/** A client's open reminders, soonest first. */
export const forClient = businessQuery({
  args: { clientId: v.id('clients') },
  returns: vOpenReminders,
  handler: async (ctx, { clientId }) => {
    const client = await getOwned(ctx, 'clients', clientId)
    return openReminders(
      await ctx.db
        .query('reminders')
        .withIndex('by_client', (q) => q.eq('clientId', client._id))
        .collect(),
    )
  },
})

/** The open reminders that point at a job, soonest first. */
export const forJob = businessQuery({
  args: { jobId: v.id('jobs') },
  returns: vOpenReminders,
  handler: async (ctx, { jobId }) => {
    const job = await getOwned(ctx, 'jobs', jobId)
    return openReminders(
      await ctx.db
        .query('reminders')
        .withIndex('by_job', (q) => q.eq('jobId', job._id))
        .collect(),
    )
  },
})

/** The open reminders that point at an item, soonest first. */
export const forItem = businessQuery({
  args: { itemId: v.id('items') },
  returns: vOpenReminders,
  handler: async (ctx, { itemId }) => {
    const item = await getOwned(ctx, 'items', itemId)
    return openReminders(
      await ctx.db
        .query('reminders')
        .withIndex('by_item', (q) => q.eq('itemId', item._id))
        .collect(),
    )
  },
})
