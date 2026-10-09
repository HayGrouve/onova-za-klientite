import { Workpool } from '@convex-dev/workpool'
import { v } from 'convex/values'
import { isPushEndpoint } from '../shared/push-endpoint'
import { components, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
import { businessMutation, businessQuery, userMutation } from './lib/auth'
import { fail } from './lib/errors'
import { spend } from './lib/rateLimit'
import { collectDueSummaries, syncSummaryTimes } from './lib/summary'

// Web Push fan-out (ADR 0011, D12): the cron finds who is due, the pool sends.
const pool = new Workpool(components.pushPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 30_000, base: 3 },
})

/** A person's devices. The oldest subscription goes when a new one would pass it. */
const MAX_SUBSCRIPTIONS_PER_USER = 10
/** A real p256dh key is 87 characters and an auth secret 22. */
const MAX_P256DH_LENGTH = 200
const MAX_AUTH_LENGTH = 100

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
    if (!isPushEndpoint(endpoint)) fail('invalid', { field: 'endpoint' })
    if (keys.p256dh.length === 0 || keys.p256dh.length > MAX_P256DH_LENGTH) {
      fail('invalid', { field: 'p256dh' })
    }
    if (keys.auth.length === 0 || keys.auth.length > MAX_AUTH_LENGTH) {
      fail('invalid', { field: 'auth' })
    }
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique()
    const now = Date.now()
    const agent = userAgent?.slice(0, 300)
    // The app repeats this on every open, so only a new or changed
    // subscription counts against the limit.
    const unchanged =
      existing?.userId === ctx.user._id &&
      existing.keys.p256dh === keys.p256dh &&
      existing.keys.auth === keys.auth
    if (!unchanged) await spend(ctx, 'pushSubscribe', ctx.user._id)
    let savedId: Id<'pushSubscriptions'>
    if (existing) {
      savedId = existing._id
      await ctx.db.patch('pushSubscriptions', existing._id, {
        userId: ctx.user._id,
        keys,
        userAgent: agent,
      })
      if (existing.userId !== ctx.user._id) {
        await syncSummaryTimes(ctx, existing.userId, now)
      }
    } else {
      savedId = await ctx.db.insert('pushSubscriptions', {
        userId: ctx.user._id,
        endpoint,
        keys,
        userAgent: agent,
      })
    }
    const mine = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .order('asc')
      .take(MAX_SUBSCRIPTIONS_PER_USER * 5)
    let excess = mine.length - MAX_SUBSCRIPTIONS_PER_USER
    for (const row of mine) {
      if (excess <= 0) break
      if (row._id === savedId) continue
      await ctx.db.delete('pushSubscriptions', row._id)
      excess -= 1
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
    for (const { userId, ...text } of messages) {
      // One action per device: a retry then repeats only the device that failed.
      const devices = await ctx.db
        .query('pushSubscriptions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(MAX_SUBSCRIPTIONS_PER_USER * 2)
      for (const device of devices) {
        await pool.enqueueAction(ctx, internal.pushNode.send, {
          subscriptionId: device._id,
          ...text,
        })
      }
    }
    return null
  },
})

export const subscriptionById = internalQuery({
  args: { subscriptionId: v.id('pushSubscriptions') },
  returns: v.union(
    v.object({
      endpoint: v.string(),
      keys: v.object({ p256dh: v.string(), auth: v.string() }),
    }),
    v.null(),
  ),
  handler: async (ctx, { subscriptionId }) => {
    const row = await ctx.db.get('pushSubscriptions', subscriptionId)
    return row ? { endpoint: row.endpoint, keys: row.keys } : null
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
