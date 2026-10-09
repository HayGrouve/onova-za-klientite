import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { STAGE_GROUPS } from '../../shared/stages'
import { emptyGroups, findCountRow } from './jobCounts'
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
 *
 * A business's counts exist only once they are built: by its first job, or by
 * the backfill. A change to a business that has jobs but no counts row doesn't
 * make one, since a row of only the changes would pass for the whole count.
 */

/** What counting needs of a job. */
type Counted = Pick<
  Doc<'jobs'>,
  '_creationTime' | 'businessId' | 'stageId' | 'stageGroup' | 'assigneeIds'
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

const emptyTotals = (): Totals => ({
  groups: emptyGroups(),
  stages: {},
  members: {},
})

/** Counts a job into (`sign` 1) or out of (-1) the totals. */
function countJob(
  totals: Totals,
  job: Pick<Counted, 'stageId' | 'stageGroup' | 'assigneeIds'>,
  sign: 1 | -1 = 1,
) {
  totals.groups[job.stageGroup] += sign
  totals.stages[job.stageId] = (totals.stages[job.stageId] ?? 0) + sign
  for (const memberId of assigneesOf(job)) {
    const groups = (totals.members[memberId] ??= emptyGroups())
    groups[job.stageGroup] += sign
  }
}

const isZero = (groups: GroupCounts) =>
  STAGE_GROUPS.every((group) => groups[group] === 0)

const isEmptyDelta = (delta: Totals) =>
  isZero(delta.groups) &&
  Object.values(delta.stages).every((count) => count === 0) &&
  Object.values<GroupCounts>(delta.members).every(isZero)

/** The totals with `delta` added; an entry that reaches zero is dropped. */
function addTotals(base: Totals, delta: Totals): Totals {
  const groups = emptyGroups()
  for (const group of STAGE_GROUPS) {
    groups[group] = base.groups[group] + delta.groups[group]
  }
  const stages = { ...base.stages }
  for (const id of Object.keys(delta.stages) as Array<Id<'stages'>>) {
    const next = (stages[id] ?? 0) + delta.stages[id]
    if (next === 0) delete stages[id]
    else stages[id] = next
  }
  const members = { ...base.members }
  for (const id of Object.keys(delta.members) as Array<Id<'memberships'>>) {
    const had = members[id] as GroupCounts | undefined
    const next = emptyGroups()
    for (const group of STAGE_GROUPS) {
      next[group] = (had?.[group] ?? 0) + delta.members[id][group]
    }
    if (isZero(next)) delete members[id]
    else members[id] = next
  }
  return { groups, stages, members }
}

/** Adds `delta` to one counts row, making the row when there is none. */
async function applyDelta(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  row: Doc<'jobCounts'> | null,
  membershipId: Id<'memberships'> | undefined,
  groupDelta: GroupCounts,
  stageDelta: Totals['stages'] = {},
) {
  const stageIds = Object.keys(stageDelta) as Array<Id<'stages'>>
  if (isZero(groupDelta) && stageIds.every((id) => stageDelta[id] === 0)) return
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

const findRebuild = (ctx: QueryCtx, businessId: Id<'businesses'>) =>
  ctx.db
    .query('jobCountRebuilds')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .first()

/**
 * A recount whose pages stopped (one failed, or its next page was lost) would
 * otherwise be patched by every job change for good. Pages follow each other
 * at once, so a recount still there after this long has been abandoned.
 */
const REBUILD_ABANDONED_MS = 60 * 60 * 1000

/** Whether the business's counts exist or a recount of them is under way. */
export async function isBuiltOrBuilding(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
) {
  return (
    (await findCountRow(ctx, businessId)) !== null ||
    (await findRebuild(ctx, businessId)) !== null
  )
}

/** Whether the business has no job but this one, which is just made. */
async function isFirstJob(ctx: QueryCtx, businessId: Id<'businesses'>) {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .take(2)
  return jobs.length === 1
}

/**
 * Moves the counts from how a job was to how it is; either may be absent.
 *
 * The live counts take the change if the business has a row, or if this is
 * its first job. While `counts:backfill` recounts the business, a job already
 * behind the recount's position is counted in the recount too, so the change
 * goes there as well; one ahead of it is counted in its new state when the
 * recount reaches it.
 */
async function moveCounts(
  ctx: MutationCtx,
  before: Counted | null,
  after: Counted | null,
) {
  const job = (after ?? before)!
  const { businessId } = job
  const delta = emptyTotals()
  if (before) countJob(delta, before, -1)
  if (after) countJob(delta, after, 1)
  if (isEmptyDelta(delta)) return
  let rebuild = await findRebuild(ctx, businessId)
  if (rebuild && Date.now() - rebuild._creationTime > REBUILD_ABANDONED_MS) {
    await ctx.db.delete('jobCountRebuilds', rebuild._id)
    rebuild = null
  }
  const business = await findCountRow(ctx, businessId)
  if (business || (before === null && (await isFirstJob(ctx, businessId)))) {
    await applyDelta(
      ctx,
      businessId,
      business,
      undefined,
      delta.groups,
      delta.stages,
    )
    for (const memberId of Object.keys(delta.members) as Array<
      Id<'memberships'>
    >) {
      await applyDelta(
        ctx,
        businessId,
        await findCountRow(ctx, businessId, memberId),
        memberId,
        delta.members[memberId],
      )
    }
  }
  if (rebuild && job._creationTime <= rebuild.after) {
    await ctx.db.patch(
      'jobCountRebuilds',
      rebuild._id,
      addTotals(rebuild, delta),
    )
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
      row.owes !== job.owes ||
      row.searchText !== job.searchText
    ) {
      await ctx.db.patch('jobAssignments', row._id, {
        clientId: job.clientId,
        stageGroup: job.stageGroup,
        dueDate: job.dueDate,
        owes: job.owes,
        searchText: job.searchText,
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
      searchText: job.searchText,
    })
  }
}

/**
 * Gives a job a new search text, and its assignment rows with it (D109). A job
 * and rows that already hold it aren't written, so a second run wakes no query.
 */
export async function setJobSearchText(
  ctx: MutationCtx,
  job: Pick<Doc<'jobs'>, '_id' | 'searchText'>,
  searchText: string,
) {
  if (job.searchText !== searchText) {
    await ctx.db.patch('jobs', job._id, { searchText })
  }
  const rows = await ctx.db
    .query('jobAssignments')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  for (const row of rows) {
    if (row.searchText !== searchText) {
      await ctx.db.patch('jobAssignments', row._id, { searchText })
    }
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
  const rebuilds = await ctx.db
    .query('jobCountRebuilds')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .collect()
  for (const row of rebuilds) await ctx.db.delete('jobCountRebuilds', row._id)
  const assignments = await ctx.db
    .query('jobAssignments')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .collect()
  for (const row of assignments) await ctx.db.delete('jobAssignments', row._id)
}

/** Whether two tallies agree, an absent entry being zero. */
function sameCounts(a: Record<string, number>, b: Record<string, number>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
    (key) => (a[key] ?? 0) === (b[key] ?? 0),
  )
}

/**
 * Writes the counts a recount found over the stored ones: rows that differ are
 * patched, missing ones made, and rows of members with no job removed. A row
 * that is already right isn't touched, so a second run wakes no query.
 */
async function writeTotals(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  totals: Totals,
) {
  const rows = await ctx.db
    .query('jobCounts')
    .withIndex('by_business_member', (q) => q.eq('businessId', businessId))
    .collect()
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
    !sameCounts(businessRow.groups, totals.groups) ||
    !sameCounts(businessRow.stages ?? {}, totals.stages)
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
    } else if (!sameCounts(row.groups, groups)) {
      await ctx.db.patch('jobCounts', row._id, { groups })
    }
  }
}

/**
 * Starts recounting a business, replacing a recount that was under way (its
 * pages find another run id and stop). Returns the run's id, or null when the
 * business is gone.
 */
export async function startRebuild(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
) {
  if (!(await ctx.db.get('businesses', businessId))) return null
  const old = await ctx.db
    .query('jobCountRebuilds')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .collect()
  for (const row of old) await ctx.db.delete('jobCountRebuilds', row._id)
  const runId = crypto.randomUUID()
  await ctx.db.insert('jobCountRebuilds', {
    businessId,
    runId,
    after: 0,
    ...emptyTotals(),
  })
  return runId
}

/**
 * Counts the next `size` jobs of a business's recount, oldest first, and
 * brings their assignment rows up to date. Jobs are taken in creation order,
 * so "counted already" is just "created at or before `after`", which is what
 * `moveCounts` tests to keep the recount in step with changes. The last page
 * makes the counts what the recount holds, and ends the run.
 *
 * Assignment rows need no such care: each is rewritten from its job as the
 * job is now, in the same transaction that reads it.
 */
export async function rebuildPage(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  runId: string,
  size: number,
): Promise<'more' | 'done' | 'superseded'> {
  const rebuild = await findRebuild(ctx, businessId)
  if (!rebuild || rebuild.runId !== runId) return 'superseded'
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_business', (q) =>
      q.eq('businessId', businessId).gt('_creationTime', rebuild.after),
    )
    .take(size)
  const totals: Totals = {
    groups: { ...rebuild.groups },
    stages: { ...rebuild.stages },
    members: { ...rebuild.members },
  }
  for (const job of jobs) {
    countJob(totals, job)
    await syncAssignments(ctx, job)
  }
  if (jobs.length === size) {
    await ctx.db.patch('jobCountRebuilds', rebuild._id, {
      after: jobs[jobs.length - 1]._creationTime,
      ...totals,
    })
    return 'more'
  }
  await writeTotals(ctx, businessId, totals)
  await ctx.db.delete('jobCountRebuilds', rebuild._id)
  return 'done'
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
