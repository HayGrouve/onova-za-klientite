import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import {
  addDays,
  addMonths,
  dateInSofia,
  sofiaOffsetMinutes,
  sofiaTimeToUtc,
} from '../../shared/dates'
import { defaultStage } from '../../shared/stages'
import { logActivity } from './activity'
import type { BusinessMutationCtx } from './auth'
import { recomputeJob } from './recompute'

type Repeat = NonNullable<Doc<'jobs'>['repeat']>

/** The job's date for repeating (Q6): its last appointment, else its due date. */
export async function jobDate(ctx: MutationCtx, job: Doc<'jobs'>) {
  const appointments = await ctx.db
    .query('appointments')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  const last = appointments
    .filter((item) => item.cancelledAt === undefined)
    .sort((a, b) => b.start - a.start)
    .at(0)
  if (last) return { date: dateInSofia(last.start), appointment: last }
  return job.dueDate ? { date: job.dueDate } : null
}

export function nextDate(date: string, repeat: Pick<Repeat, 'every' | 'unit'>) {
  return repeat.unit === 'week'
    ? addDays(date, 7 * repeat.every)
    : addMonths(date, repeat.every)
}

/** Keeps `nextRepeatOn` on the job's date while the series still waits for its next job. */
export async function refreshRepeat(ctx: MutationCtx, jobId: Id<'jobs'>) {
  const job = await ctx.db.get('jobs', jobId)
  if (
    !job?.repeat ||
    job.repeat.stoppedAt !== undefined ||
    job.repeat.nextJobId
  )
    return
  const when = await jobDate(ctx, job)
  if (job.nextRepeatOn !== when?.date) {
    await ctx.db.patch('jobs', job._id, { nextRepeatOn: when?.date })
  }
}

/** Wall-clock hour and minute of a moment in Sofia. */
function sofiaClock(ms: number) {
  const local = new Date(ms + sofiaOffsetMinutes(ms) * 60_000)
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes() }
}

/**
 * Creates the next job of a series one interval after this one: same client,
 * title, items, lines or price, address and extra fields, in the first New
 * stage. Idempotent: a job that already has its next job is left alone.
 */
export async function createNextInSeries(ctx: MutationCtx, job: Doc<'jobs'>) {
  if (!job.repeat || job.repeat.stoppedAt !== undefined) return null
  if (job.repeat.nextJobId) {
    if (job.nextRepeatOn !== undefined)
      await ctx.db.patch('jobs', job._id, { nextRepeatOn: undefined })
    return null
  }
  const business = await ctx.db.get('businesses', job.businessId)
  const member = await ctx.db.get('memberships', job.createdBy)
  const user = member ? await ctx.db.get('users', member.userId) : null
  if (!business || !member || !user) return null
  const as: BusinessMutationCtx = { ...ctx, business, member, user }

  const when = await jobDate(ctx, job)
  if (!when) {
    await ctx.db.patch('jobs', job._id, { nextRepeatOn: undefined })
    return null
  }
  const stages = await ctx.db
    .query('stages')
    .withIndex('by_business_order', (q) => q.eq('businessId', business._id))
    .collect()
  const stage = defaultStage(stages)
  if (!stage) return null

  const date = nextDate(when.date, job.repeat)
  const now = Date.now()
  const nextId = await ctx.db.insert('jobs', {
    businessId: business._id,
    clientId: job.clientId,
    title: job.title,
    stageId: stage._id,
    stageGroup: stage.group,
    stageChangedAt: now,
    lines: job.lines,
    typedPriceCents: job.typedPriceCents,
    dueDate: when.appointment ? undefined : date,
    address: job.address,
    notes: job.notes,
    itemIds: job.itemIds,
    assigneeIds: job.assigneeIds,
    source: job.source,
    repeat: { every: job.repeat.every, unit: job.repeat.unit },
    nextRepeatOn: date,
    seriesId: job.seriesId ?? job._id,
    extra: job.extra,
    priceCents: 0,
    paidCents: 0,
    costCents: 0,
    balanceCents: 0,
    owes: false,
    searchText: job.searchText,
    createdBy: job.createdBy,
  })
  for (const itemId of job.itemIds) {
    await ctx.db.insert('jobItems', {
      businessId: business._id,
      jobId: nextId,
      itemId,
    })
  }
  if (when.appointment) {
    const source = when.appointment
    const clock = sofiaClock(source.start)
    const start = source.allDay
      ? sofiaTimeToUtc(date, 0, 0)
      : sofiaTimeToUtc(date, clock.hour, clock.minute)
    await ctx.db.insert('appointments', {
      businessId: business._id,
      jobId: nextId,
      clientId: job.clientId,
      start,
      end:
        source.end === undefined
          ? undefined
          : start + (source.end - source.start),
      allDay: source.allDay,
      label: source.label,
      assigneeIds: source.assigneeIds,
    })
  }
  await recomputeJob(ctx, nextId)
  await ctx.db.patch('jobs', job._id, {
    repeat: { ...job.repeat, nextJobId: nextId },
    nextRepeatOn: undefined,
  })
  await logActivity(as, {
    type: 'job.created',
    jobId: nextId,
    clientId: job.clientId,
    data: { name: job.title },
  })
  await logActivity(as, {
    type: 'job.repeated',
    jobId: job._id,
    clientId: job.clientId,
    data: { to: date, toId: nextId },
  })
  return nextId
}
