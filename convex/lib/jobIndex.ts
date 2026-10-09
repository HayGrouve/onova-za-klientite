import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { STAGE_GROUPS } from '../../shared/stages'
import { emptyGroups } from './jobCounts'
import type { GroupCounts } from './jobCounts'

/**
 * What is derived from `jobs` so no screen has to read every job (D105, D106):
 *
 * - `jobCounts`: the jobs in each stage group and each stage, for the
 *   business, and the jobs in each stage group for each member they are
 *   assigned to;
 * - `jobAssignments`: one row per job and assignee, with the group, due date,
 *   client and `owes` copied from the job, so a Worker's jobs are an index read.
 *
 * Only convex/lib/ledger.ts (and recompute.ts, for `owes`) calls the writers
 * here, from the places every job insert and change goes through. Both are
 * rebuilt from the jobs by `internal.counts.backfill`.
 */

/** What counting needs of a job. */
type Counted = Pick<
  Doc<'jobs'>,
  'businessId' | 'stageId' | 'stageGroup' | 'assigneeIds'
>

/** The members a job is assigned to, each once. */
const assigneesOf = (job: Pick<Doc<'jobs'>, 'assigneeIds'>) => [
  ...new Set(job.assigneeIds),
]

/** The counts of a business: the whole of it, and per member. */
export type Totals = {
  groups: GroupCounts
  stages: Record<Id<'stages'>, number>
  members: Record<Id<'memberships'>, GroupCounts>
}

export const emptyTotals = (): Totals => ({
  groups: emptyGroups(),
  stages: {},
  members: {},
})

/** Counts a job into (`sign` 1) or out of (-1) the totals. */
export function countJob(totals: Totals, job: Counted, sign: 1 | -1 = 1) {
  totals.groups[job.stageGroup] += sign
  totals.stages[job.stageId] = (totals.stages[job.stageId] ?? 0) + sign
  for (const memberId of assigneesOf(job)) {
    const groups = (totals.members[memberId] ??= emptyGroups())
    groups[job.stageGroup] += sign
  }
}

const isZero = (groups: GroupCounts) =>
  STAGE_GROUPS.every((group) => groups[group] === 0)

/** Adds `delta` to one counts row, making the row when there is none. */
async function applyDelta(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  membershipId: Id<'memberships'> | undefined,
  groupDelta: GroupCounts,
  stageDelta: Totals['stages'] = {},
) {
  const stageIds = Object.keys(stageDelta) as Array<Id<'stages'>>
  if (isZero(groupDelta) && stageIds.every((id) => stageDelta[id] === 0)) return
  const row = await ctx.db
    .query('jobCounts')
    .withIndex('by_business_member', (q) =>
      q.eq('businessId', businessId).eq('membershipId', membershipId),
    )
    .first()
  const groups = emptyGroups()
  for (const group of STAGE_GROUPS) {
    groups[group] = Math.max(0, (row?.groups[group] ?? 0) + groupDelta[group])
  }
  const stages: Totals['stages'] = { ...row?.stages }
  for (const id of stageIds) {
    const next = Math.max(0, (stages[id] ?? 0) + stageDelta[id])
    if (next === 0) delete stages[id]
    else stages[id] = next
  }
  const fields = membershipId === undefined ? { groups, stages } : { groups }
  if (row) await ctx.db.patch('jobCounts', row._id, fields)
  else await ctx.db.insert('jobCounts', { businessId, membershipId, ...fields })
}

/** Moves the counts from how a job was to how it is; either may be absent. */
async function moveCounts(
  ctx: MutationCtx,
  before: Counted | null,
  after: Counted | null,
) {
  const businessId = (after ?? before)!.businessId
  const delta = emptyTotals()
  if (before) countJob(delta, before, -1)
  if (after) countJob(delta, after, 1)
  await applyDelta(ctx, businessId, undefined, delta.groups, delta.stages)
  for (const memberId of Object.keys(delta.members) as Array<
    Id<'memberships'>
  >) {
    await applyDelta(ctx, businessId, memberId, delta.members[memberId])
  }
}

/** Makes the job's assignment rows match its assignees and the fields they copy. */
export async function syncAssignments(ctx: MutationCtx, job: Doc<'jobs'>) {
  const rows = await ctx.db
    .query('jobAssignments')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  const wanted = new Set<Id<'memberships'>>(assigneesOf(job))
  const kept = new Set<Id<'memberships'>>()
  for (const row of rows) {
    if (!wanted.has(row.membershipId) || kept.has(row.membershipId)) {
      await ctx.db.delete('jobAssignments', row._id)
      continue
    }
    kept.add(row.membershipId)
    if (
      row.clientId !== job.clientId ||
      row.stageGroup !== job.stageGroup ||
      row.dueDate !== job.dueDate ||
      row.owes !== job.owes
    ) {
      await ctx.db.patch('jobAssignments', row._id, {
        clientId: job.clientId,
        stageGroup: job.stageGroup,
        dueDate: job.dueDate,
        owes: job.owes,
      })
    }
  }
  for (const membershipId of wanted) {
    if (kept.has(membershipId)) continue
    await ctx.db.insert('jobAssignments', {
      businessId: job.businessId,
      jobId: job._id,
      membershipId,
      clientId: job.clientId,
      stageGroup: job.stageGroup,
      dueDate: job.dueDate,
      owes: job.owes,
    })
  }
}

/** A job was inserted. */
export async function indexInsertedJob(ctx: MutationCtx, job: Doc<'jobs'>) {
  await moveCounts(ctx, null, job)
  if (job.assigneeIds.length > 0) await syncAssignments(ctx, job)
}

const sameSlot = (a: Counted, b: Counted) =>
  a.stageId === b.stageId &&
  a.stageGroup === b.stageGroup &&
  a.assigneeIds.length === b.assigneeIds.length &&
  a.assigneeIds.every((id, index) => id === b.assigneeIds[index])

/** A job changed from `before` to `after`. */
export async function indexChangedJob(
  ctx: MutationCtx,
  before: Doc<'jobs'>,
  after: Doc<'jobs'>,
) {
  if (!sameSlot(before, after)) await moveCounts(ctx, before, after)
  if (before.assigneeIds.length > 0 || after.assigneeIds.length > 0) {
    await syncAssignments(ctx, after)
  }
}

/** Forgets a business's counts and assignments, as its jobs are deleted. */
export async function clearJobIndex(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
) {
  const counts = await ctx.db
    .query('jobCounts')
    .withIndex('by_business_member', (q) => q.eq('businessId', businessId))
    .collect()
  for (const row of counts) await ctx.db.delete('jobCounts', row._id)
  const assignments = await ctx.db
    .query('jobAssignments')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .collect()
  for (const row of assignments) await ctx.db.delete('jobAssignments', row._id)
}

/**
 * Writes the counts a recount found over the stored ones: rows that differ are
 * patched, missing ones made, and rows of members with no job removed. A row
 * that is already right isn't touched, so a second run wakes no query.
 */
export async function writeTotals(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  totals: Totals,
) {
  const rows = await ctx.db
    .query('jobCounts')
    .withIndex('by_business_member', (q) => q.eq('businessId', businessId))
    .collect()
  const same = (a: object, b: object) =>
    JSON.stringify(Object.entries(a).sort()) ===
    JSON.stringify(Object.entries(b).sort())
  let businessRow: Doc<'jobCounts'> | undefined
  const memberRows = new Map<Id<'memberships'>, Doc<'jobCounts'>>()
  for (const row of rows) {
    const memberId = row.membershipId
    const seen =
      memberId === undefined
        ? businessRow !== undefined
        : memberRows.has(memberId)
    const wanted = memberId === undefined || memberId in totals.members
    if (seen || !wanted) {
      await ctx.db.delete('jobCounts', row._id)
    } else if (memberId === undefined) {
      businessRow = row
    } else {
      memberRows.set(memberId, row)
    }
  }
  if (!businessRow) {
    await ctx.db.insert('jobCounts', {
      businessId,
      groups: totals.groups,
      stages: totals.stages,
    })
  } else if (
    !same(businessRow.groups, totals.groups) ||
    !same(businessRow.stages ?? {}, totals.stages)
  ) {
    await ctx.db.patch('jobCounts', businessRow._id, {
      groups: totals.groups,
      stages: totals.stages,
    })
  }
  for (const memberId of Object.keys(totals.members) as Array<
    Id<'memberships'>
  >) {
    const groups = totals.members[memberId]
    const row = memberRows.get(memberId)
    if (!row) {
      await ctx.db.insert('jobCounts', {
        businessId,
        membershipId: memberId,
        groups,
      })
    } else if (!same(row.groups, groups)) {
      await ctx.db.patch('jobCounts', row._id, { groups })
    }
  }
}

/** Removes assignment rows whose job is gone or no longer lists the member. */
export async function dropStaleAssignments(
  ctx: MutationCtx,
  rows: Array<Doc<'jobAssignments'>>,
) {
  for (const row of rows) {
    const job = await ctx.db.get('jobs', row.jobId)
    if (!job || !job.assigneeIds.includes(row.membershipId)) {
      await ctx.db.delete('jobAssignments', row._id)
    }
  }
}
