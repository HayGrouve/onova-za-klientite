import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { userMutation } from './lib/auth'
import { DELETED_TABLE_NAMES, queryByBusiness } from './lib/businessTables'

const BATCH = 200

/** Webhook deliveries are remembered this long; Svix stops retrying after about three days. */
const WEBHOOK_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Изтрий данните (ADR 0012): the signed-in user wipes their data in this app
 * and stays signed in. The Акаунт itself is deleted only on the hub, so
 * nothing here calls Clerk. The next `users.ensureCurrent` finds no row and
 * starts them over with a fresh business.
 */
export const deleteMyData = userMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await eraseUser(ctx, ctx.user)
    return null
  },
})

/**
 * The same erase by Clerk subject, for the `user.deleted` webhook and for the
 * cutover's wipe of the owner's old production row
 * (`npx convex run --prod account:eraseByClerkUserId '{"clerkUserId": "user_…"}'`).
 * An unknown subject is a no-op.
 */
export const eraseByClerkUserId = internalMutation({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }) => {
    await eraseByClerkUser(ctx, clerkUserId)
    return null
  },
})

/**
 * A verified `user.deleted` delivery from Clerk (`/clerk/webhook`). Each
 * `svix-id` is acted on once: a replay is acknowledged and ignored. Returns
 * false for a replay.
 */
export const recordUserDeleted = internalMutation({
  args: { eventId: v.string(), clerkUserId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { eventId, clerkUserId }) => {
    const seen = await ctx.db
      .query('webhookEvents')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .first()
    if (seen) return false
    await ctx.db.insert('webhookEvents', { eventId, processedAt: Date.now() })
    await eraseByClerkUser(ctx, clerkUserId)
    return true
  },
})

/** Forgets webhook deliveries older than the retention, a batch per run. */
export const pruneWebhookEvents = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const old = await ctx.db
      .query('webhookEvents')
      .withIndex('by_processed_at', (q) =>
        q.lt('processedAt', Date.now() - WEBHOOK_EVENT_RETENTION_MS),
      )
      .take(BATCH)
    for (const event of old) await ctx.db.delete('webhookEvents', event._id)
    if (old.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.account.pruneWebhookEvents, {})
    }
    return null
  },
})

async function eraseByClerkUser(ctx: MutationCtx, clerkUserId: string) {
  const user = await ctx.db
    .query('users')
    .withIndex('by_clerk_user', (q) => q.eq('clerkUserId', clerkUserId))
    .unique()
  if (user) await eraseUser(ctx, user)
}

/**
 * The one erase (Изтрий данните and `user.deleted`). At once: the user row,
 * its push subscriptions and its memberships, so the person is cut off from
 * every business and a later sign-in looks brand new. Businesses where they
 * were the only active member are then erased in batches (the D124 path);
 * shared ones keep going without them.
 */
async function eraseUser(ctx: MutationCtx, user: Doc<'users'>) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect()
  const businessIds: Array<Id<'businesses'>> = []
  for (const membership of memberships) {
    const others = (
      await ctx.db
        .query('memberships')
        .withIndex('by_business_user', (q) =>
          q.eq('businessId', membership.businessId),
        )
        .collect()
    ).filter(
      (item) => item.userId !== user._id && item.deactivatedAt === undefined,
    )
    if (others.length === 0) businessIds.push(membership.businessId)
    await ctx.db.delete('memberships', membership._id)
  }
  for (const subscription of await ctx.db
    .query('pushSubscriptions')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect()) {
    await ctx.db.delete('pushSubscriptions', subscription._id)
  }
  await ctx.db.delete('users', user._id)
  if (businessIds.length > 0) await scheduleDeletion(ctx, businessIds)
}

/**
 * Deletes the businesses' data in batches. The caller has already cut
 * everyone off from the businesses.
 */
export async function scheduleDeletion(
  ctx: MutationCtx,
  businessIds: Array<Id<'businesses'>>,
) {
  const jobId = await ctx.db.insert('deletionJobs', {
    businessIds,
    table: DELETED_TABLE_NAMES[0],
    status: 'running',
  })
  await ctx.scheduler.runAfter(0, internal.account.deleteStep, { jobId })
}

/** One batch of the deletion: a page of one table of one business, then the next step. */
export const deleteStep = internalMutation({
  args: { jobId: v.id('deletionJobs') },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get('deletionJobs', jobId)
    if (!job || job.status === 'done') return null
    const businessId = job.businessIds.at(0)
    if (!businessId) {
      await ctx.db.patch('deletionJobs', jobId, { status: 'done' })
      return null
    }

    const table = job.table as (typeof DELETED_TABLE_NAMES)[number]
    const rows = await queryByBusiness(ctx, table, businessId).take(BATCH)
    for (const row of rows) {
      if ('storageId' in row) await ctx.storage.delete(row.storageId)
      await ctx.db.delete(table, row._id as never)
    }
    if (rows.length < BATCH) {
      const next = DELETED_TABLE_NAMES[
        DELETED_TABLE_NAMES.indexOf(table) + 1
      ] as (typeof DELETED_TABLE_NAMES)[number] | undefined
      if (next) {
        await ctx.db.patch('deletionJobs', jobId, { table: next })
      } else {
        await ctx.db.delete('businesses', businessId)
        await ctx.db.patch('deletionJobs', jobId, {
          businessIds: job.businessIds.slice(1),
          table: DELETED_TABLE_NAMES[0],
        })
      }
    }
    await ctx.scheduler.runAfter(0, internal.account.deleteStep, { jobId })
    return null
  },
})
