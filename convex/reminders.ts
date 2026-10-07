import { v } from 'convex/values'
import { isValidDate } from '../shared/dates'
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
    if (clientId) await getOwned(ctx, 'clients', clientId)
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

/**
 * "Snooze": moves an open reminder to another day and answers with the day it
 * was on, so an undo can snooze it back. Null when nothing moved: a closed
 * reminder, or the same day.
 */
export const snooze = businessMutation({
  args: { reminderId: v.id('reminders'), date: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    if (!isValidDate(args.date)) fail('invalid', { field: 'date' })
    const reminder = await getOwned(ctx, 'reminders', args.reminderId)
    if (reminder.status !== 'open' || reminder.date === args.date) return null
    await ctx.db.patch('reminders', reminder._id, { date: args.date })
    await logActivity(ctx, {
      type: 'reminder.moved',
      clientId: reminder.clientId,
      jobId: reminder.jobId,
      itemId: reminder.itemId,
      data: { from: reminder.date, to: args.date, note: reminder.note },
    })
    return reminder.date
  },
})

/** Undo of Done or Dismiss: the reminder is open again, on its old date. */
export const reopen = businessMutation({
  args: { reminderId: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const reminder = await getOwned(ctx, 'reminders', args.reminderId)
    if (reminder.status === 'open') return null
    await ctx.db.patch('reminders', reminder._id, {
      status: 'open',
      closedAt: undefined,
    })
    await logActivity(ctx, {
      type: 'reminder.reopened',
      clientId: reminder.clientId,
      jobId: reminder.jobId,
      itemId: reminder.itemId,
      data: { note: reminder.note },
    })
    return null
  },
})

/** A client's open reminders, soonest first. */
export const forClient = businessQuery({
  args: { clientId: v.id('clients') },
  returns: v.array(
    v.object({
      _id: v.id('reminders'),
      date: v.string(),
      note: v.string(),
      source: v.union(v.literal('manual'), v.literal('rule')),
      jobId: v.optional(v.id('jobs')),
      itemId: v.optional(v.id('items')),
    }),
  ),
  handler: async (ctx, { clientId }) => {
    const client = await getOwned(ctx, 'clients', clientId)
    const reminders = await ctx.db
      .query('reminders')
      .withIndex('by_client', (q) => q.eq('clientId', client._id))
      .collect()
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
  },
})
