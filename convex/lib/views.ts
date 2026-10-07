import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { vExtra, vStageColor, vStageGroup } from '../validators'
import { listExtra, listFieldIds } from './listFields'

/** A job as lists show it: enough for a row, nothing more. */
export const vJobRow = v.object({
  _id: v.id('jobs'),
  _creationTime: v.number(),
  title: v.string(),
  clientId: v.id('clients'),
  clientName: v.string(),
  isNoClient: v.boolean(),
  stageId: v.id('stages'),
  stageName: v.string(),
  stageColor: vStageColor,
  stageGroup: vStageGroup,
  dueDate: v.optional(v.string()),
  priceCents: v.number(),
  paidCents: v.number(),
  balanceCents: v.number(),
  owes: v.boolean(),
  doneAt: v.optional(v.number()),
  /** The job's first item, which a reminder from the job also points at. */
  itemId: v.optional(v.id('items')),
  /** The next appointment that isn't done or cancelled, if any. */
  nextAppointment: v.optional(
    v.object({ start: v.number(), allDay: v.boolean() }),
  ),
  /** Values of the job fields marked "show in list". */
  listExtra: v.optional(vExtra),
})

type Lookups = {
  clients: Map<Id<'clients'>, Doc<'clients'> | null>
  stages: Map<Id<'stages'>, Doc<'stages'> | null>
  /** The job fields shown in lists, read once per query. */
  listFields?: Set<string>
}

export function newLookups(): Lookups {
  return { clients: new Map(), stages: new Map() }
}

async function cached<T extends 'clients' | 'stages'>(
  ctx: QueryCtx,
  map: Map<Id<T>, Doc<T> | null>,
  table: T,
  id: Id<T>,
) {
  if (!map.has(id)) map.set(id, await ctx.db.get(table, id))
  return map.get(id) ?? null
}

export async function jobRow(
  ctx: QueryCtx,
  job: Doc<'jobs'>,
  lookups: Lookups,
  now = Date.now(),
) {
  lookups.listFields ??= await listFieldIds(ctx, job.businessId, 'job')
  const client = await cached(ctx, lookups.clients, 'clients', job.clientId)
  const stage = await cached(ctx, lookups.stages, 'stages', job.stageId)
  const appointments = await ctx.db
    .query('appointments')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  const next = appointments
    .filter(
      (item) =>
        item.cancelledAt === undefined &&
        item.doneAt === undefined &&
        (item.end ?? item.start) >= now - 12 * 60 * 60 * 1000,
    )
    .sort((a, b) => a.start - b.start)
    .at(0)
  return {
    _id: job._id,
    _creationTime: job._creationTime,
    title: job.title,
    clientId: job.clientId,
    clientName: client?.name ?? '',
    isNoClient: client?.isNoClient ?? false,
    stageId: job.stageId,
    stageName: stage?.name ?? '',
    stageColor: stage?.color ?? 'gray',
    stageGroup: job.stageGroup,
    dueDate: job.dueDate,
    priceCents: job.priceCents,
    paidCents: job.paidCents,
    balanceCents: job.balanceCents,
    owes: job.owes,
    doneAt: job.doneAt,
    itemId: job.itemIds.at(0),
    nextAppointment: next
      ? { start: next.start, allDay: next.allDay }
      : undefined,
    listExtra: listExtra(job.extra, lookups.listFields),
  }
}

export const vActivityItem = v.object({
  _id: v.id('activity'),
  _creationTime: v.number(),
  type: v.string(),
  actorName: v.string(),
  jobId: v.optional(v.id('jobs')),
  data: v.object({
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    note: v.optional(v.string()),
    name: v.optional(v.string()),
    fromId: v.optional(v.string()),
    toId: v.optional(v.string()),
  }),
})

/** A record's timeline, newest first, with who did each change. */
export async function timeline(
  ctx: QueryCtx,
  events: Array<Doc<'activity'>>,
  limit = 50,
) {
  const sorted = [...events]
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, limit)
  const names = new Map<Id<'memberships'>, string>()
  const result = []
  for (const event of sorted) {
    if (!names.has(event.actorId)) {
      const membership = await ctx.db.get('memberships', event.actorId)
      const user = membership
        ? await ctx.db.get('users', membership.userId)
        : null
      names.set(event.actorId, user?.name ?? '')
    }
    result.push({
      _id: event._id,
      _creationTime: event._creationTime,
      type: event.type,
      actorName: names.get(event.actorId) ?? '',
      jobId: event.jobId,
      data: event.data,
    })
  }
  return result
}
