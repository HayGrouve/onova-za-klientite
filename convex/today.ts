import { v } from 'convex/values'
import { isValidDate } from '../shared/dates'
import type { Doc } from './_generated/dataModel'
import { businessQuery } from './lib/auth'
import { queryNow } from './lib/clock'
import { fail } from './lib/errors'
import { collectToday } from './lib/todayData'
import type { TodayVisit } from './lib/todayData'
import { jobRow, newLookups, vJobRow } from './lib/views'

const vAppointmentRow = v.object({
  _id: v.id('appointments'),
  start: v.number(),
  end: v.optional(v.number()),
  allDay: v.boolean(),
  label: v.optional(v.string()),
  doneAt: v.optional(v.number()),
  job: v.optional(vJobRow),
})

const vReminderRow = v.object({
  _id: v.id('reminders'),
  date: v.string(),
  note: v.string(),
  clientId: v.optional(v.id('clients')),
  clientName: v.optional(v.string()),
  jobId: v.optional(v.id('jobs')),
  itemId: v.optional(v.id('items')),
})

/**
 * Today: what to act on (CONTEXT "Today"). `today` is the Sofia calendar date
 * from the device, so the list turns over at local midnight. A job is in one
 * section only (`arrangeToday`).
 */
export const list = businessQuery({
  args: { today: v.string(), now: v.optional(v.number()) },
  returns: v.object({
    appointments: v.array(vAppointmentRow),
    upcoming: v.array(vAppointmentRow),
    overdue: v.array(vJobRow),
    dueSoon: v.array(vJobRow),
    reminders: v.array(vReminderRow),
    doneUnpaid: v.array(vJobRow),
  }),
  handler: async (ctx, { today, now: clientNow }) => {
    if (!isValidDate(today)) fail('invalid', { field: 'today' })
    const lookups = newLookups()
    const now = queryNow(clientNow)
    const arranged = await collectToday(ctx, ctx.business, ctx.member, today, {
      rest: true,
      overdue: true,
      reminders: true,
    })

    const appointmentRow = async ({ appointment, job }: TodayVisit) => ({
      _id: appointment._id,
      start: appointment.start,
      end: appointment.end,
      allDay: appointment.allDay,
      label: appointment.label,
      doneAt: appointment.doneAt,
      job: job ? await jobRow(ctx, job, lookups, now) : undefined,
    })
    const appointmentRows = async (visits: TodayVisit[]) => {
      const rows = []
      for (const visit of visits) rows.push(await appointmentRow(visit))
      return rows
    }
    const jobRows = async (jobs: Array<Doc<'jobs'>>) => {
      const rows = []
      for (const job of jobs) rows.push(await jobRow(ctx, job, lookups, now))
      return rows
    }

    const reminderRows = []
    for (const reminder of arranged.reminders) {
      const client = reminder.clientId
        ? await ctx.db.get('clients', reminder.clientId)
        : null
      reminderRows.push({
        _id: reminder._id,
        date: reminder.date,
        note: reminder.note,
        clientId: reminder.clientId,
        clientName: client?.name,
        jobId: reminder.jobId,
        itemId: reminder.itemId,
      })
    }

    return {
      appointments: await appointmentRows(arranged.appointments),
      upcoming: await appointmentRows(arranged.upcoming),
      overdue: await jobRows(arranged.overdue),
      dueSoon: await jobRows(arranged.dueSoon),
      doneUnpaid: await jobRows(arranged.doneUnpaid),
      reminders: reminderRows,
    }
  },
})
