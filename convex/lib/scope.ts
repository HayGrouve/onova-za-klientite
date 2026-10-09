import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import type { StageGroup } from '../../shared/stages'
import { getOwnedFromUrl } from './auth'
import { fail } from './errors'

type Member = Doc<'memberships'>
export type ScopedCtx = QueryCtx & {
  member: Member
  business: Doc<'businesses'>
}

/**
 * Whether the member sees only their own work (D89). Owners and Managers see
 * the whole business; a Worker sees the jobs assigned to them, the clients and
 * items of those jobs, and no money beyond a job's own price and balance.
 */
export function isWorker(member: Member) {
  return member.role === 'worker'
}

/** Whether the member may see this job. */
export function seesJob(member: Member, job: Pick<Doc<'jobs'>, 'assigneeIds'>) {
  return !isWorker(member) || job.assigneeIds.includes(member._id)
}

/** Whether the member may see a history event: a Worker sees nothing about costs. */
export function seesEvent(
  member: Member,
  event: Pick<Doc<'activity'>, 'type'>,
) {
  return !isWorker(member) || !event.type.startsWith('cost.')
}

/** Whether the member may see this appointment: assigned to them, or on a job they see. */
export function seesAppointment(
  member: Member,
  appointment: Pick<Doc<'appointments'>, 'assigneeIds'>,
  job: Pick<Doc<'jobs'>, 'assigneeIds'> | null,
) {
  return (
    !isWorker(member) ||
    appointment.assigneeIds.includes(member._id) ||
    (job !== null && seesJob(member, job))
  )
}

/**
 * A Worker's assigned jobs come from `jobAssignments` (D106), an index on
 * the member, so they are found whatever the business's size. The rows are the
 * ledger's copy of each job's group, due date, client and `owes`.
 */

/** Most of a Worker's own assignment rows read at once, for their clients. */
const MAX_ASSIGNED = 4000

/** The jobs behind assignment rows, those the member still sees. */
async function jobsOf(
  ctx: QueryCtx,
  member: Member,
  rows: Array<Doc<'jobAssignments'>>,
) {
  const jobs: Array<Doc<'jobs'>> = []
  for (const row of rows) {
    const job = await ctx.db.get('jobs', row.jobId)
    if (job && seesJob(member, job)) jobs.push(job)
  }
  return jobs
}

/** A Worker's jobs in one stage group, soonest due first, undated first (as `jobs`' own index). */
export async function workerJobsIn(
  ctx: QueryCtx,
  member: Member,
  group: StageGroup,
  limit: number,
) {
  return await jobsOf(
    ctx,
    member,
    await ctx.db
      .query('jobAssignments')
      .withIndex('by_member_group_due', (q) =>
        q.eq('membershipId', member._id).eq('stageGroup', group),
      )
      .take(limit),
  )
}

/** A Worker's jobs in a group that are due before `today`: overdue, if open. */
export async function workerJobsLate(
  ctx: QueryCtx,
  member: Member,
  group: StageGroup,
  today: string,
) {
  return await jobsOf(
    ctx,
    member,
    await ctx.db
      .query('jobAssignments')
      .withIndex('by_member_group_due', (q) =>
        q
          .eq('membershipId', member._id)
          .eq('stageGroup', group)
          .gt('dueDate', '')
          .lt('dueDate', today),
      )
      .collect(),
  )
}

/** A Worker's jobs in a group due from `from` to `to`, both days included. */
export async function workerJobsDue(
  ctx: QueryCtx,
  member: Member,
  group: StageGroup,
  from: string,
  to: string,
) {
  return await jobsOf(
    ctx,
    member,
    await ctx.db
      .query('jobAssignments')
      .withIndex('by_member_group_due', (q) =>
        q
          .eq('membershipId', member._id)
          .eq('stageGroup', group)
          .gte('dueDate', from)
          .lte('dueDate', to),
      )
      .collect(),
  )
}

/** A Worker's Done jobs that still owe. */
export async function workerJobsOwing(
  ctx: QueryCtx,
  member: Member,
  limit?: number,
) {
  const query = ctx.db
    .query('jobAssignments')
    .withIndex('by_member_owes_group', (q) =>
      q
        .eq('membershipId', member._id)
        .eq('owes', true)
        .eq('stageGroup', 'done'),
    )
  return await jobsOf(
    ctx,
    member,
    limit === undefined ? await query.collect() : await query.take(limit),
  )
}

/** Every assignment of the Worker, in any group: for their clients. */
export async function workerAssignments(ctx: ScopedCtx) {
  return await ctx.db
    .query('jobAssignments')
    .withIndex('by_member_group_due', (q) =>
      q.eq('membershipId', ctx.member._id),
    )
    .take(MAX_ASSIGNED)
}

/** The member's own jobs for a client. Everything for an Owner or Manager. */
export async function visibleJobsOfClient(
  ctx: ScopedCtx,
  clientId: Id<'clients'>,
) {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_client', (q) => q.eq('clientId', clientId))
    .collect()
  return jobs.filter((job) => seesJob(ctx.member, job))
}

/** The member's own jobs an item is on. Every one for an Owner or Manager. */
export async function visibleJobsOfItem(ctx: ScopedCtx, itemId: Id<'items'>) {
  const links = await ctx.db
    .query('jobItems')
    .withIndex('by_item', (q) => q.eq('itemId', itemId))
    .collect()
  const jobs = []
  for (const link of links) {
    const job = await ctx.db.get('jobs', link.jobId)
    if (job && seesJob(ctx.member, job)) jobs.push(job)
  }
  return jobs
}

/** Whether the member may see this client: a Worker only through one of their jobs. */
export async function seesClient(ctx: ScopedCtx, clientId: Id<'clients'>) {
  if (!isWorker(ctx.member)) return true
  return (await visibleJobsOfClient(ctx, clientId)).length > 0
}

/** Whether the member may see this item: a Worker only through one of their jobs. */
export async function seesItem(ctx: ScopedCtx, itemId: Id<'items'>) {
  if (!isWorker(ctx.member)) return true
  return (await visibleJobsOfItem(ctx, itemId)).length > 0
}

/**
 * `getOwnedFromUrl` for a job, client or item page. One the member may not
 * see is `notFound`, as if it were in another business, so a Worker learns
 * nothing about work that isn't theirs.
 */
export async function getVisibleFromUrl<T extends 'jobs' | 'clients' | 'items'>(
  ctx: ScopedCtx,
  table: T,
  id: string,
): Promise<Doc<T>> {
  const doc = await getOwnedFromUrl(ctx, table, id)
  const visible =
    table === 'jobs'
      ? seesJob(ctx.member, doc as unknown as Doc<'jobs'>)
      : table === 'clients'
        ? await seesClient(ctx, doc._id as Id<'clients'>)
        : await seesItem(ctx, doc._id as Id<'items'>)
  if (!visible) fail('notFound', { table })
  return doc
}
