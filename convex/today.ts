import { v } from 'convex/values'
import { isValidDate } from '../shared/dates'
import type { Doc } from './_generated/dataModel'
import { businessQuery } from './lib/auth'
import { queryNow } from './lib/clock'
import { fail } from './lib/errors'
import { collectToday } from './lib/todayData'
import type { TodayVisit } from './lib/todayData'
import {
  jobRow,
  newLookups,
  reminderRows,
  vAppointmentRow,
  vJobRow,
  vReminderRow,
} from './lib/views'

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

    return {
      appointments: await appointmentRows(arranged.appointments),
      upcoming: await appointmentRows(arranged.upcoming),
      overdue: await jobRows(arranged.overdue),
      dueSoon: await jobRows(arranged.dueSoon),
      doneUnpaid: await jobRows(arranged.doneUnpaid),
      reminders: await reminderRows(ctx, arranged.reminders),
    }
  },
})
