import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { sofiaOffsetMinutes, sofiaTimeToUtc } from '../../shared/dates'
import {
  nextRepeatDate,
  pickJobDate,
  repeatAnchorDay,
} from '../../shared/repeat'
import { defaultStage } from '../../shared/stages'
import { logActivity } from './activity'
import type { BusinessMutationCtx } from './auth'
import { fail } from './errors'
import { insertJob } from './ledger'

/**
 * Sets how often a job repeats (Q6), every 1–52 weeks or months, and creates
 * the next job when it is due. The caller has checked the job has a date.
 */
export async function setJobRepeat(
  ctx: BusinessMutationCtx,
  job: Doc<'jobs'>,
  repeat: { every: number; unit: 'week' | 'month' },
) {
  const { every, unit } = repeat
  if (!Number.isInteger(every) || every < 1 || every > 52) {
    fail('invalid', { field: 'every' })
  }
  await ctx.db.patch('jobs', job._id, {
    repeat: { every, unit, nextJobId: job.repeat?.nextJobId },
  })
  await refreshRepeat(ctx, job._id)
  await logActivity(ctx, {
    type: 'job.repeatSet',
    jobId: job._id,
    clientId: job.clientId,
    data: { to: `${every} ${unit}` },
  })
}

/** The job's date for repeating (Q6, D41): see `pickJobDate`. */
export async function jobDate(ctx: MutationCtx, job: Doc<'jobs'>) {
  const appointments = await ctx.db
    .query('appointments')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  return pickJobDate({ appointments, dueDate: job.dueDate })
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
 * Who a series' next job is created as: the job's creator, else the
 * business's owner when the creator has gone. Null when nobody is left.
 */
async function seriesActor(ctx: MutationCtx, job: Doc<'jobs'>) {
  const creator = await ctx.db.get('memberships', job.createdBy)
  const creatorUser = creator ? await ctx.db.get('users', creator.userId) : null
  if (creator && creatorUser) return { member: creator, user: creatorUser }
  const members = await ctx.db
    .query('memberships')
    .withIndex('by_business_user', (q) => q.eq('businessId', job.businessId))
    .collect()
  for (const member of members) {
    if (member.role !== 'owner' || member.deactivatedAt !== undefined) continue
    const user = await ctx.db.get('users', member.userId)
    if (user) return { member, user }
  }
  return null
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
  const actor = business ? await seriesActor(ctx, job) : null
  if (!business || !actor) {
    // Nobody can create it: stop the run from trying again every day.
    if (job.nextRepeatOn !== undefined)
      await ctx.db.patch('jobs', job._id, { nextRepeatOn: undefined })
    return null
  }
  const { member, user } = actor
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

  const date = nextRepeatDate(when.date, job.repeat)
  const now = Date.now()
  const nextId = await insertJob(ctx, {
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
    repeat: {
      every: job.repeat.every,
      unit: job.repeat.unit,
      anchorDay: repeatAnchorDay(when.date, job.repeat),
    },
    nextRepeatOn: date,
    seriesId: job.seriesId ?? job._id,
    extra: job.extra,
    searchText: job.searchText,
    createdBy: member._id,
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
