import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { isValidDate, sofiaTimeToUtc, stampMoment } from '../shared/dates'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import { fail } from './lib/errors'
import { refreshRepeat } from './lib/repeat'
import { optionalText } from './lib/validate'

const vSlot = {
  date: v.string(),
  time: v.optional(v.object({ hour: v.number(), minute: v.number() })),
  /** For a stretch over several days, e.g. a two-day installation. */
  endDate: v.optional(v.string()),
  endTime: v.optional(v.object({ hour: v.number(), minute: v.number() })),
  label: v.optional(v.string()),
}

type Slot = {
  date: string
  time?: { hour: number; minute: number }
  endDate?: string
  endTime?: { hour: number; minute: number }
}

function checkTime(time: { hour: number; minute: number } | undefined) {
  if (!time) return
  const ok =
    Number.isInteger(time.hour) &&
    time.hour >= 0 &&
    time.hour <= 23 &&
    Number.isInteger(time.minute) &&
    time.minute >= 0 &&
    time.minute <= 59
  if (!ok) fail('invalid', { field: 'time' })
}

/** Calendar date and optional time in Sofia → start, end and all-day. */
function toMoments(slot: Slot) {
  if (!isValidDate(slot.date)) fail('invalid', { field: 'date' })
  if (slot.endDate !== undefined && !isValidDate(slot.endDate))
    fail('invalid', { field: 'endDate' })
  checkTime(slot.time)
  checkTime(slot.endTime)
  const start = sofiaTimeToUtc(
    slot.date,
    slot.time?.hour ?? 0,
    slot.time?.minute ?? 0,
  )
  const endDate = slot.endDate ?? (slot.endTime ? slot.date : undefined)
  const end = endDate
    ? sofiaTimeToUtc(
        endDate,
        slot.endTime?.hour ?? 23,
        slot.endTime?.minute ?? 59,
      )
    : undefined
  if (end !== undefined && end < start) fail('invalid', { field: 'end' })
  return { start, end, allDay: !slot.time }
}

export const add = businessMutation({
  args: { jobId: v.id('jobs'), ...vSlot },
  returns: v.id('appointments'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const appointmentId = await ctx.db.insert('appointments', {
      businessId: ctx.business._id,
      jobId: job._id,
      clientId: job.clientId,
      ...toMoments(args),
      label: optionalText(args.label, 'label', 60),
      assigneeIds: [],
    })
    await refreshRepeat(ctx, job._id)
    await logActivity(ctx, {
      type: 'appointment.added',
      jobId: job._id,
      clientId: job.clientId,
      data: { to: stampMoment(args.date, args.time), note: args.label },
    })
    return appointmentId
  },
})

export const update = businessMutation({
  args: { appointmentId: v.id('appointments'), ...vSlot },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const appointment = await getOwned(ctx, 'appointments', args.appointmentId)
    const patch: Partial<Doc<'appointments'>> = {
      ...toMoments(args),
      label: optionalText(args.label, 'label', 60),
    }
    await ctx.db.patch('appointments', appointment._id, patch)
    if (appointment.jobId) await refreshRepeat(ctx, appointment.jobId)
    await logActivity(ctx, {
      type: 'appointment.changed',
      jobId: appointment.jobId,
      clientId: appointment.clientId,
      data: { to: stampMoment(args.date, args.time), note: args.label },
    })
    return null
  },
})

/** Cancelled, never deleted: it stays in the job's history. */
export const cancel = businessMutation({
  args: { appointmentId: v.id('appointments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const appointment = await getOwned(ctx, 'appointments', args.appointmentId)
    if (appointment.cancelledAt !== undefined) return null
    await ctx.db.patch('appointments', appointment._id, {
      cancelledAt: Date.now(),
    })
    if (appointment.jobId) await refreshRepeat(ctx, appointment.jobId)
    await logActivity(ctx, {
      type: 'appointment.cancelled',
      jobId: appointment.jobId,
      clientId: appointment.clientId,
      data: { note: appointment.label },
    })
    return null
  },
})
