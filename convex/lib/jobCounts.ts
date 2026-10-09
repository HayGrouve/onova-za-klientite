import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { STAGE_GROUPS } from '../../shared/stages'
import type { StageGroup } from '../../shared/stages'

export type GroupCounts = Record<StageGroup, number>

export const emptyGroups = (): GroupCounts => ({
  new: 0,
  in_progress: 0,
  done: 0,
  cancelled: 0,
})

/** The counts row of a business, or, with a member, of that member's jobs. */
export async function findCountRow(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  membershipId?: Id<'memberships'>,
) {
  return await ctx.db
    .query('jobCounts')
    .withIndex('by_business_member', (q) =>
      q.eq('businessId', businessId).eq('membershipId', membershipId),
    )
    .first()
}

/** The most jobs of one stage group a recount reads. */
const RECOUNT_LIMIT = 500

/**
 * The counts as the jobs say, for a business whose counts aren't built: the
 * old way, reading up to RECOUNT_LIMIT jobs of each group, so a very large
 * business is counted short until `counts:backfill` has run.
 */
async function recountJobs(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  membershipId?: Id<'memberships'>,
) {
  const groups = emptyGroups()
  const stages: Record<Id<'stages'>, number> = {}
  for (const group of STAGE_GROUPS) {
    const jobs = await ctx.db
      .query('jobs')
      .withIndex('by_business_group_due', (q) =>
        q.eq('businessId', businessId).eq('stageGroup', group),
      )
      .take(RECOUNT_LIMIT)
    for (const job of jobs) {
      if (membershipId && !job.assigneeIds.includes(membershipId)) continue
      groups[group]++
      stages[job.stageId] = (stages[job.stageId] ?? 0) + 1
    }
  }
  return { groups, stages: membershipId ? {} : stages }
}

/**
 * How many jobs each stage group (and, for the business, each stage) holds:
 * exact, from the `jobCounts` rows the ledger keeps (D105), without reading
 * a job. With `membershipId` it counts that member's assigned jobs, which is
 * what a Worker sees.
 *
 * A business with no counts row hasn't been counted yet (a job change never
 * makes the row on its own), whatever else it holds: it is recounted from its
 * jobs instead of read as empty. Once the business has a row, a member with
 * none has no assigned jobs.
 */
export async function readJobCounts(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  membershipId?: Id<'memberships'>,
) {
  const business = await findCountRow(ctx, businessId)
  if (!business) return await recountJobs(ctx, businessId, membershipId)
  const row = membershipId
    ? await findCountRow(ctx, businessId, membershipId)
    : business
  return {
    groups: { ...emptyGroups(), ...row?.groups },
    stages: (row?.stages ?? {}) as Record<Id<'stages'>, number>,
  }
}
