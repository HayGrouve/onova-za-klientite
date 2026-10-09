import { addDays, sofiaTimeToUtc } from '../../shared/dates'
import { arrangeToday } from '../../shared/today'
import type { Doc } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import {
  isWorker,
  seesAppointment,
  workerJobsDue,
  workerJobsLate,
  workerJobsOwing,
} from './scope'

export const UPCOMING_DAYS = 7
export const SOON_DAYS = 3

/** An appointment with the job it belongs to, if any. */
export type TodayVisit = {
  appointment: Doc<'appointments'>
  job?: Doc<'jobs'>
}

/** What a caller wants from Today. Left out, a part is not read. */
export type TodayWanted = {
  /** The visits over the next days, and the jobs due soon and done but unpaid. */
  rest: boolean
  overdue: boolean
  reminders: boolean
}

/**
 * Everything Today lists, as records and already arranged: a job is under
 * one reason only (`arrangeToday`). The Today screen and the morning push
 * both read it, so their numbers cannot drift apart (Q17, D89). What a
 * Worker may see is applied here.
 *
 * `rest` is only for the screen: the upcoming visits, due soon and done but
 * unpaid come after the appointments and overdue in `arrangeToday`, so they
 * can't change those two lists.
 */
export async function collectToday(
  ctx: QueryCtx,
  business: Doc<'businesses'>,
  member: Doc<'memberships'>,
  today: string,
  wanted: TodayWanted,
) {
  const businessId = business._id
  const dayStart = sofiaTimeToUtc(today, 0, 0)
  const tomorrowStart = sofiaTimeToUtc(addDays(today, 1), 0, 0)
  const rangeEnd = wanted.rest
    ? sofiaTimeToUtc(addDays(today, UPCOMING_DAYS + 1), 0, 0)
    : tomorrowStart
  const appointments = await ctx.db
    .query('appointments')
    .withIndex('by_business_start', (q) =>
      q
        .eq('businessId', businessId)
        .gte('start', dayStart)
        .lt('start', rangeEnd),
    )
    .collect()
  const todays: TodayVisit[] = []
  const upcoming: TodayVisit[] = []
  for (const appointment of appointments) {
    if (appointment.cancelledAt !== undefined) continue
    const job = appointment.jobId
      ? ((await ctx.db.get('jobs', appointment.jobId)) ?? undefined)
      : undefined
    if (!seesAppointment(member, appointment, job ?? null)) continue
    if (appointment.start < tomorrowStart) todays.push({ appointment, job })
    else upcoming.push({ appointment, job })
  }

  // Overdue and due soon: New and In progress jobs by due date (Q17).
  // A Worker's jobs come from their assignments, an index on them (D106).
  const worker = isWorker(member)
  const overdue: Array<Doc<'jobs'>> = []
  const dueSoon: Array<Doc<'jobs'>> = []
  const soonEnd = addDays(today, SOON_DAYS)
  for (const group of ['new', 'in_progress'] as const) {
    if (wanted.overdue) {
      overdue.push(
        ...(worker
          ? await workerJobsLate(ctx, member, group, today)
          : await ctx.db
              .query('jobs')
              .withIndex('by_business_group_due', (q) =>
                q
                  .eq('businessId', businessId)
                  .eq('stageGroup', group)
                  .gt('dueDate', '')
                  .lt('dueDate', today),
              )
              .collect()),
      )
    }
    if (wanted.rest) {
      dueSoon.push(
        ...(worker
          ? await workerJobsDue(ctx, member, group, today, soonEnd)
          : await ctx.db
              .query('jobs')
              .withIndex('by_business_group_due', (q) =>
                q
                  .eq('businessId', businessId)
                  .eq('stageGroup', group)
                  .gte('dueDate', today)
                  .lte('dueDate', soonEnd),
              )
              .collect()),
      )
    }
  }
  const byDue = (a: Doc<'jobs'>, b: Doc<'jobs'>) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  overdue.sort(byDue)
  dueSoon.sort(byDue)

  // Reminders are a Manager's to act on (D89).
  const reminders =
    wanted.reminders && business.modules.reminders && !worker
      ? await ctx.db
          .query('reminders')
          .withIndex('by_business_status_date', (q) =>
            q
              .eq('businessId', businessId)
              .eq('status', 'open')
              .lte('date', today),
          )
          .collect()
      : []

  // Q7: Today's "done but unpaid" shows only the Done group.
  const doneUnpaid = wanted.rest
    ? (worker
        ? await workerJobsOwing(ctx, member)
        : await ctx.db
            .query('jobs')
            .withIndex('by_business_owes', (q) =>
              q
                .eq('businessId', businessId)
                .eq('owes', true)
                .eq('stageGroup', 'done'),
            )
            .collect()
      ).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))
    : []

  return {
    ...arrangeToday({
      appointments: todays,
      upcoming,
      overdue,
      dueSoon,
      doneUnpaid,
    }),
    reminders,
  }
}
