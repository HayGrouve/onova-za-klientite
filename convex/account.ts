import { v } from 'convex/values'
import { internal } from './_generated/api'
import { env, internalAction, internalMutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { userMutation } from './lib/auth'
import { DELETED_TABLE_NAMES, queryByBusiness } from './lib/businessTables'

const BATCH = 200

/**
 * Deletes the account and its data (GDPR). Businesses where the user is the
 * only active member are deleted entirely, in batches; in shared ones only
 * the membership goes. Then the user, their push subscriptions and the
 * Clerk user. Progress is tracked in `deletionJobs`.
 */
export const deleteAccount = userMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
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
        (item) =>
          item.userId !== ctx.user._id && item.deactivatedAt === undefined,
      )
      if (others.length === 0) businessIds.push(membership.businessId)
      else await ctx.db.delete('memberships', membership._id)
    }
    // From here the user can't sign back into these businesses.
    await ctx.db.patch('users', ctx.user._id, { activeBusinessId: undefined })
    await scheduleDeletion(ctx, businessIds, ctx.user._id)
    return null
  },
})

/**
 * Deletes the businesses' data in batches, then the user when one is given.
 * The caller has already cut everyone off from the businesses.
 */
export async function scheduleDeletion(
  ctx: MutationCtx,
  businessIds: Array<Id<'businesses'>>,
  userId?: Id<'users'>,
) {
  const jobId = await ctx.db.insert('deletionJobs', {
    ...(userId ? { userId } : {}),
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

    if (businessId) {
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
    }

    // Every business is gone: now the person, when the account goes too.
    if (!job.userId) {
      await ctx.db.patch('deletionJobs', jobId, { status: 'done' })
      return null
    }
    const userId = job.userId
    const user = await ctx.db.get('users', userId)
    for (const subscription of await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete('pushSubscriptions', subscription._id)
    }
    for (const membership of await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()) {
      await ctx.db.delete('memberships', membership._id)
    }
    if (user) {
      await ctx.db.delete('users', user._id)
      await ctx.scheduler.runAfter(0, internal.account.deleteClerkUser, {
        clerkUserId: user.clerkUserId,
      })
    }
    await ctx.db.patch('deletionJobs', jobId, { status: 'done' })
    return null
  },
})

/** Removes the sign-in account at Clerk too. Skipped where no key is set (tests, previews). */
export const deleteClerkUser = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (_ctx, { clerkUserId }) => {
    const key = env.CLERK_SECRET_KEY
    if (!key || clerkUserId.startsWith('seed_')) return null
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${key}` } },
    )
    if (!response.ok && response.status !== 404) {
      throw new Error(`Clerk user deletion failed: ${response.status}`)
    }
    return null
  },
})
