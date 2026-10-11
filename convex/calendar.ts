import { v } from 'convex/values'
import { spanDays } from '../shared/calendar'
import {
  addDays,
  dateInSofia,
  isValidMonth,
  monthRange,
  sofiaTimeToUtc,
} from '../shared/dates'
import type { Doc } from './_generated/dataModel'
import { businessQuery } from './lib/auth'
import { queryNow } from './lib/clock'
import { fail } from './lib/errors'
import { isWorker, seesAppointment, workerJobsDue } from './lib/scope'
import {
  jobRow,
  newLookups,
  reminderRows,
  vAppointmentRow,
  vJobRow,
  vReminderRow,
} from './lib/views'

/**
 * How far back a visit may start and still reach into the month: a stretch
 * such as a two-day installation. One longer than this shows from its start.
 */
const LONGEST_STRETCH_DAYS = 31

/**
 * One month for Today's calendar (D125): its visits with the days each covers,
 * the open jobs due in it, and the open reminders, for planning past the week
 * Today lists. A Worker gets their own jobs and no reminders (D89), as on Today.
 * Off modules show nothing of theirs.
 */
export const month = businessQuery({
  args: { month: v.string(), now: v.optional(v.number()) },
  returns: v.object({
    visits: v.array(
      v.object({ ...vAppointmentRow.fields, days: v.array(v.string()) }),
    ),
    due: v.array(vJobRow),
    reminders: v.array(vReminderRow),
  }),
  handler: async (ctx, args) => {
    if (!isValidMonth(args.month)) fail('invalid', { field: 'month' })
    const { business, member } = ctx
    const businessId = business._id
    const { from, to } = monthRange(args.month)
    const lookups = newLookups()
    const now = queryNow(args.now)
    const worker = isWorker(member)

    const visits = []
    if (business.modules.appointments) {
      const appointments = await ctx.db
        .query('appointments')
        .withIndex('by_business_start', (q) =>
          q
            .eq('businessId', businessId)
            .gte(
              'start',
              sofiaTimeToUtc(addDays(from, -LONGEST_STRETCH_DAYS), 0, 0),
            )
            .lt('start', sofiaTimeToUtc(addDays(to, 1), 0, 0)),
        )
        .collect()
      for (const appointment of appointments) {
        if (appointment.cancelledAt !== undefined) continue
        const days = spanDays(
          dateInSofia(appointment.start),
          appointment.end === undefined
            ? undefined
            : dateInSofia(appointment.end),
          from,
          to,
        )
        if (days.length === 0) continue
        const job = appointment.jobId
          ? await ctx.db.get('jobs', appointment.jobId)
          : null
        if (!seesAppointment(member, appointment, job)) continue
        visits.push({
          _id: appointment._id,
          start: appointment.start,
          end: appointment.end,
          allDay: appointment.allDay,
          label: appointment.label,
          doneAt: appointment.doneAt,
          job: job ? await jobRow(ctx, job, lookups, now) : undefined,
          days,
        })
      }
    }

    // Due dates matter while the work is open: New and In progress.
    const dueJobs: Array<Doc<'jobs'>> = []
    for (const group of ['new', 'in_progress'] as const) {
      dueJobs.push(
        ...(worker
          ? await workerJobsDue(ctx, member, group, from, to)
          : await ctx.db
              .query('jobs')
              .withIndex('by_business_group_due', (q) =>
                q
                  .eq('businessId', businessId)
                  .eq('stageGroup', group)
                  .gte('dueDate', from)
                  .lte('dueDate', to),
              )
              .collect()),
      )
    }
    dueJobs.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    const due = []
    for (const job of dueJobs) due.push(await jobRow(ctx, job, lookups, now))

    // Reminders are a Manager's to act on (D89).
    const reminders =
      business.modules.reminders && !worker
        ? await ctx.db
            .query('reminders')
            .withIndex('by_business_status_date', (q) =>
              q
                .eq('businessId', businessId)
                .eq('status', 'open')
                .gte('date', from)
                .lte('date', to),
            )
            .collect()
        : []

    return {
      visits,
      due,
      reminders: await reminderRows(ctx, reminders),
    }
  },
})
