import { isOpenGroup } from './stages'
import type { StageGroup } from './stages'

/** An appointment as Today lists it: the job it belongs to, if any. */
export type TodayAppointment = {
  job?: { _id: string; stageGroup: StageGroup }
}

/** A job in one of Today's job lists. */
export type TodayJob = { _id: string }

export type TodayLists<
  TAppointment extends TodayAppointment,
  TJob extends TodayJob,
> = {
  /** Appointments that start today, earliest first. */
  appointments: TAppointment[]
  /** Appointments over the next days, earliest first. */
  upcoming: TAppointment[]
  overdue: TJob[]
  dueSoon: TJob[]
  doneUnpaid: TJob[]
}

/**
 * Today shows each job once, under the most urgent reason to look at it:
 * a visit today, then overdue, then due soon, then done but unpaid, then a
 * visit in the next days. (Reminders aren't jobs, so they stay out of this.)
 * Every list keeps its order. A job that is Done or Cancelled has no place in
 * the schedule: its leftover appointments stay on the job, not on Today.
 * Today's schedule keeps every visit of a job, the week ahead only its first.
 */
export function arrangeToday<
  TAppointment extends TodayAppointment,
  TJob extends TodayJob,
>(lists: TodayLists<TAppointment, TJob>): TodayLists<TAppointment, TJob> {
  const shown = new Set<string>()
  const open = (item: TAppointment) =>
    !item.job || isOpenGroup(item.job.stageGroup)

  const appointments = lists.appointments.filter(open)
  for (const item of appointments) if (item.job) shown.add(item.job._id)

  const claim = (jobs: TJob[]) =>
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
