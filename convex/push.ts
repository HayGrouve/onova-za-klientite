import { Workpool } from '@convex-dev/workpool'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
import { businessMutation, businessQuery, userMutation } from './lib/auth'
import { fail } from './lib/errors'
import { collectDueSummaries, syncSummaryTimes } from './lib/summary'

// Web Push fan-out (ADR 0011, D12): the cron finds who is due, the pool sends.
const pool = new Workpool(components.pushPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 30_000, base: 3 },
})

const MAX_ENDPOINT_LENGTH = 2048

const vNotify = v.object({
  morningSummary: v.boolean(),
  remindersDue: v.boolean(),
  overdue: v.boolean(),
})

/**
 * Saves this device's subscription. Idempotent per endpoint: the app calls it
 * again on every open when the permission is granted (ADR 0011). An endpoint
 * that was another account's on the same device moves to the caller.
 */
export const subscribe = userMutation({
  args: {
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
    userAgent: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { endpoint, keys, userAgent }) => {
    if (
      !endpoint.startsWith('https://') ||
      endpoint.length > MAX_ENDPOINT_LENGTH
    ) {
      fail('invalid', { field: 'endpoint' })
    }
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique()
    const now = Date.now()
    const agent = userAgent?.slice(0, 300)
    if (existing) {
      await ctx.db.patch('pushSubscriptions', existing._id, {
        userId: ctx.user._id,
        keys,
        userAgent: agent,
      })
      if (existing.userId !== ctx.user._id) {
        await syncSummaryTimes(ctx, existing.userId, now)
      }
    } else {
      await ctx.db.insert('pushSubscriptions', {
        userId: ctx.user._id,
        endpoint,
        keys,
        userAgent: agent,
      })
    }
    await syncSummaryTimes(ctx, ctx.user._id, now)
    return null
  },
})

/** Removes this device's subscription, if it is the caller's. */
export const unsubscribe = userMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique()
    if (!existing || existing.userId !== ctx.user._id) return null
    await ctx.db.delete('pushSubscriptions', existing._id)
    await syncSummaryTimes(ctx, ctx.user._id, Date.now())
    return null
  },
})

/** The caller's switches in this business, and whether any device is subscribed. */
export const settings = businessQuery({
  args: {},
  returns: v.object({ notify: vNotify, subscribed: v.boolean() }),
  handler: async (ctx) => {
    const subscription = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .first()
    return { notify: ctx.member.notify, subscribed: subscription !== null }
  },
})

/** Changes the caller's own switches. Not logged: it is a personal preference. */
export const setNotify = businessMutation({
  args: {
    morningSummary: v.optional(v.boolean()),
    remindersDue: v.optional(v.boolean()),
    overdue: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { morningSummary, remindersDue, overdue }) => {
    await ctx.db.patch('memberships', ctx.member._id, {
      notify: {
        morningSummary: morningSummary ?? ctx.member.notify.morningSummary,
        remindersDue: remindersDue ?? ctx.member.notify.remindersDue,
        overdue: overdue ?? ctx.member.notify.overdue,
      },
    })
    await syncSummaryTimes(ctx, ctx.user._id, Date.now())
    return null
  },
})

/** The cron: every 15 minutes, send the morning summaries that are due. */
export const runDueSummaries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const messages = await collectDueSummaries(ctx, Date.now())
    for (const message of messages) {
      await pool.enqueueAction(ctx, internal.pushNode.send, message)
    }
    return null
  },
})

export const subscriptionsOf = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(
    v.object({
      _id: v.id('pushSubscriptions'),
      endpoint: v.string(),
      keys: v.object({ p256dh: v.string(), auth: v.string() }),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(20)
    return rows.map(({ _id, endpoint, keys }) => ({ _id, endpoint, keys }))
  },
})

/** After a send: record the successes and drop the subscriptions the service says are gone. */
export const recordSendResults = internalMutation({
  args: {
    delivered: v.array(v.id('pushSubscriptions')),
    gone: v.array(v.id('pushSubscriptions')),
  },
  returns: v.null(),
  handler: async (ctx, { delivered, gone }) => {
    const now = Date.now()
    for (const id of delivered) {
      if (await ctx.db.get('pushSubscriptions', id)) {
        await ctx.db.patch('pushSubscriptions', id, { lastSuccessAt: now })
      }
    }
    const owners = new Set<Id<'users'>>()
    for (const id of gone) {
      const row = await ctx.db.get('pushSubscriptions', id)
      if (!row) continue
      owners.add(row.userId)
      await ctx.db.delete('pushSubscriptions', id)
    }
    for (const userId of owners) {
      await syncSummaryTimes(ctx, userId, now)
    }
    return null
  },
})
