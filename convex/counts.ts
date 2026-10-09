import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import {
  dropStaleAssignments,
  isBuiltOrBuilding,
  rebuildPage,
  startRebuild,
} from './lib/ledger'

const BUSINESSES_PER_PAGE = 50
const JOBS_PER_PAGE = 500
const ASSIGNMENTS_PER_PAGE = 500

/**
 * Rebuilds what is derived from the jobs (D105, D106) in every business: the
 * stage counts (`jobCounts`) and the Worker assignment rows (`jobAssignments`).
 * Every production deploy runs it (scripts/vercel-build.sh), and it can be run
 * by hand:
 *
 *   npx convex run counts:backfill '{}'          (add `--prod` for production)
 *
 * The deploy passes `onlyMissing`, which skips a business already built.
 *
 * It is safe to run twice and while the app is in use: rows that are already
 * right aren't written, and a job changed during the recount is counted
 * exactly once (see `rebuildPage`). A business is done in pages of 500 jobs,
 * each page scheduling the next, then the assignment rows left without a job
 * are dropped. Until a business's recount ends, its screens count its jobs
 * the old way (`readJobCounts`).
 */
export const backfill = internalMutation({
  args: {
    /** Without a business: the businesses, a page at a time. */
    businessId: v.optional(v.id('businesses')),
    /** The page of businesses, or, with `stale`, of assignment rows. */
    cursor: v.optional(v.union(v.string(), v.null())),
    /** The recount of a business that is under way; none starts one. */
    runId: v.optional(v.string()),
    /** The second pass over a business: assignment rows without a job. */
    stale: v.optional(v.boolean()),
    /**
     * Only businesses whose counts were never built and aren't being built:
     * what every production deploy runs, so a deploy doesn't re-read every job
     * of every business, nor restart a recount that is under way.
     */
    onlyMissing: v.optional(v.boolean()),
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
        if (args.onlyMissing && (await isBuiltOrBuilding(ctx, business._id)))
          continue
        await ctx.scheduler.runAfter(0, internal.counts.backfill, {
          businessId: business._id,
        })
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.counts.backfill, {
          cursor: page.continueCursor,
          onlyMissing: args.onlyMissing,
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

    const runId = args.runId ?? (await startRebuild(ctx, businessId))
    if (runId === null) return null
    const state = await rebuildPage(ctx, businessId, runId, JOBS_PER_PAGE)
    if (state === 'more') {
      await ctx.scheduler.runAfter(0, internal.counts.backfill, {
        businessId,
        runId,
      })
    } else if (state === 'done') {
      await ctx.scheduler.runAfter(0, internal.counts.backfill, {
        businessId,
        stale: true,
      })
    }
    return null
  },
})
