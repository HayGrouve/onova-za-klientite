import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import type { StageGroup } from '../../shared/stages'

export type GroupCounts = Record<StageGroup, number>

export const emptyGroups = (): GroupCounts => ({
  new: 0,
  in_progress: 0,
  done: 0,
  cancelled: 0,
})

/**
 * How many jobs each stage group (and, for the business, each stage) holds:
 * exact, from the `jobCounts` rows the ledger keeps (D105), without reading
 * a job. With `membershipId` it counts that member's assigned jobs, which is
 * what a Worker sees. A business or member with no row has no jobs.
 */
export async function readJobCounts(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  membershipId?: Id<'memberships'>,
) {
  const row = await ctx.db
    .query('jobCounts')
    .withIndex('by_business_member', (q) =>
      q.eq('businessId', businessId).eq('membershipId', membershipId),
    )
    .first()
  return {
    groups: { ...emptyGroups(), ...row?.groups },
    stages: (row?.stages ?? {}) as Record<Id<'stages'>, number>,
  }
}
