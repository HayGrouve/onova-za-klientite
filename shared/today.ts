import { isOverdue } from './dates'
import type { StageGroup } from './stages'

/** An appointment as Today lists it: the job it belongs to, if any. */
export type TodayAppointment = {
  job?: { _id: string; stageGroup: StageGroup }
}

/** A job in one of Today's job lists. */
export type TodayJob = { _id: string }

export type TodayLists<A extends TodayAppointment, J extends TodayJob> = {
  /** Appointments that start today, earliest first. */
  appointments: A[]
  /** Appointments over the next days, earliest first. */
  upcoming: A[]
  overdue: J[]
  dueSoon: J[]
  doneUnpaid: J[]
}

const CLOSED: ReadonlySet<StageGroup> = new Set(['done', 'cancelled'])

/** Overdue means late and still open: a Done or Cancelled job is never late. */
export function isJobLate(
  job: { stageGroup: StageGroup; dueDate?: string },
  today: string,
): boolean {
  return !CLOSED.has(job.stageGroup) && isOverdue(job.dueDate, today)
}

/**
 * Today shows each job once, under the most urgent reason to look at it:
 * a visit today, then overdue, then due soon, then done but unpaid, then a
 * visit in the next days. (Reminders aren't jobs, so they stay out of this.)
 * Every list keeps its order. A job that is Done or Cancelled has no place in
 * the schedule: its leftover appointments stay on the job, not on Today.
 * Today's schedule keeps every visit of a job, the week ahead only its first.
 */
export function arrangeToday<A extends TodayAppointment, J extends TodayJob>(
  lists: TodayLists<A, J>,
): TodayLists<A, J> {
  const shown = new Set<string>()
  const open = (item: A) => !item.job || !CLOSED.has(item.job.stageGroup)

  const appointments = lists.appointments.filter(open)
  for (const item of appointments) if (item.job) shown.add(item.job._id)

  const claim = (jobs: J[]) =>
    jobs.filter((item) => {
      if (shown.has(item._id)) return false
      shown.add(item._id)
      return true
    })
  const overdue = claim(lists.overdue)
  const dueSoon = claim(lists.dueSoon)
  const doneUnpaid = claim(lists.doneUnpaid)

  const upcoming = lists.upcoming.filter((item) => {
    if (!open(item)) return false
    if (!item.job) return true
    if (shown.has(item.job._id)) return false
    shown.add(item.job._id)
    return true
  })

  return { appointments, upcoming, overdue, dueSoon, doneUnpaid }
}
