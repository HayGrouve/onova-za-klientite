import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import {
  countJob,
  dropStaleAssignments,
  emptyTotals,
  syncAssignments,
  writeTotals,
} from './lib/ledger'
import { vGroupCounts } from './validators'

const BUSINESSES_PER_PAGE = 50
const JOBS_PER_PAGE = 500
const ASSIGNMENTS_PER_PAGE = 500

/** The counts found so far in a business, handed from one page to the next. */
const vCarry = v.object({
  groups: vGroupCounts,
  stages: v.record(v.id('stages'), v.number()),
  members: v.record(v.id('memberships'), vGroupCounts),
})

/**
 * Rebuilds what is derived from the jobs (D105, D106) in every business: the
 * stage counts (`jobCounts`) and the Worker assignment rows (`jobAssignments`).
 * Run it once after the counts shipped, and again if they are ever suspect:
 *
 *   npx convex run counts:backfill '{}'          (add `--prod` for production)
 *
 * It is safe to run twice and while the app is in use: rows that are already
 * right aren't written, and new jobs are counted as they change. A job changed
 * during the few seconds of a business's recount can be missed, so run it
 * again if a count looks off. A business is done in pages of 500 jobs, each
 * page scheduling the next, then the assignment rows left without a job are
 * dropped.
 */
export const backfill = internalMutation({
  args: {
    /** Without a business: the businesses, a page at a time. */
    businessId: v.optional(v.id('businesses')),
    cursor: v.optional(v.union(v.string(), v.null())),
    carry: v.optional(vCarry),
    /** The second pass over a business: assignment rows without a job. */
    stale: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { businessId } = args
    if (!businessId) {
      const page = await ctx.db.query('businesses').paginate({
        cursor: args.cursor ?? null,
        numItems: BUSINESSES_PER_PAGE,
      })
      for (const business of page.page) {
        await ctx.scheduler.runAfter(0, internal.counts.backfill, {
          businessId: business._id,
        })
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.counts.backfill, {
          cursor: page.continueCursor,
        })
      }
      return null
    }

    if (args.stale) {
      const page = await ctx.db
        .query('jobAssignments')
        .withIndex('by_business', (q) => q.eq('businessId', businessId))
        .paginate({
          cursor: args.cursor ?? null,
          numItems: ASSIGNMENTS_PER_PAGE,
        })
      await dropStaleAssignments(ctx, page.page)
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.counts.backfill, {
          businessId,
          stale: true,
          cursor: page.continueCursor,
        })
      }
      return null
    }

    const page = await ctx.db
      .query('jobs')
      .withIndex('by_business_group_due', (q) => q.eq('businessId', businessId))
      .paginate({ cursor: args.cursor ?? null, numItems: JOBS_PER_PAGE })
    const totals = args.carry ?? emptyTotals()
    for (const job of page.page) {
      countJob(totals, job)
      await syncAssignments(ctx, job)
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.counts.backfill, {
        businessId,
        cursor: page.continueCursor,
        carry: totals,
      })
      return null
    }
    await writeTotals(ctx, businessId, totals)
    await ctx.scheduler.runAfter(0, internal.counts.backfill, {
      businessId,
      stale: true,
    })
    return null
  },
})
