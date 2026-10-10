import { isOverdue } from './dates'
import { isJobLate, isOpenGroup } from './stages'
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

/** A job as the late count reads it. */
type LateCandidate = { _id: string; stageGroup: StageGroup; dueDate?: string }

/**
 * The late jobs: open and due before `today` (`isJobLate`), each once, whether
 * Today lists it under overdue or under a visit (a late job with a visit today
 * is listed only under the visit, `arrangeToday`). The overdue list comes
 * first, then the late jobs found under visits. The wide Today's late section,
 * its tile and the morning push all read this, so they agree (D110).
 */
export function lateJobs<TJob extends LateCandidate>(
  arranged: {
    appointments: Array<{ job?: TJob }>
    upcoming: Array<{ job?: TJob }>
    overdue: TJob[]
  },
  today: string,
): TJob[] {
  const seen = new Set<string>()
  const late: TJob[] = []
  const jobs = [
    ...arranged.overdue,
    ...[...arranged.appointments, ...arranged.upcoming].flatMap((visit) =>
      visit.job ? [visit.job] : [],
    ),
  ]
  for (const job of jobs) {
    if (seen.has(job._id) || !isJobLate(job, today)) continue
    seen.add(job._id)
    late.push(job)
  }
  return late
}

/** How many late jobs there are (`lateJobs`). */
export function lateJobCount(
  arranged: Parameters<typeof lateJobs>[0],
  today: string,
): number {
  return lateJobs(arranged, today).length
}

/** A visit as the queue reads it. */
type QueueVisit = {
  start: number
  end?: number
  allDay: boolean
  doneAt?: number
  job?: TodayJob
}

/** A reminder as the queue reads it. */
type QueueReminder = { date: string }

/** One thing on Today's queue, with why it is there. */
export type TodayEntry<
  TVisit extends QueueVisit,
  TJob extends TodayJob,
  TReminder extends QueueReminder,
> =
  | { kind: 'visit'; visit: TVisit }
  | { kind: 'job'; job: TJob; reason: 'late' | 'soon' | 'unpaid' }
  | { kind: 'reminder'; reminder: TReminder; late: boolean }

// A visit with no end counts as current for an hour after it starts.
const VISIT_HOUR = 60 * 60 * 1000

function visitIsOver(visit: QueueVisit, now: number): boolean {
  if (visit.doneAt !== undefined) return true
  if (visit.allDay) return false
  return (visit.end ?? visit.start + VISIT_HOUR) < now
}

/**
 * Today as one queue, one thing at a time (D119): `first` is what to do now,
 * `rest` what comes after, each entry once. `lists` is already arranged
 * (`arrangeToday`), so a job is under one reason only.
 *
 * The order is today's visits by time, late reminders, overdue jobs, jobs due
 * soon, the other reminders, then done but unpaid. `first` is the next visit
 * today that isn't over; without one, the first entry that isn't a visit; and
 * when only past visits are left, the earliest of them. A visit with no job
 * (blocked time) has nothing to open, so it stays off the queue.
 */
export function todayQueue<
  TVisit extends QueueVisit,
  TJob extends TodayJob,
  TReminder extends QueueReminder,
>(
  lists: {
    appointments: TVisit[]
    overdue: TJob[]
    dueSoon: TJob[]
    doneUnpaid: TJob[]
    reminders: TReminder[]
  },
  today: string,
  now: number,
): {
  first?: TodayEntry<TVisit, TJob, TReminder>
  rest: Array<TodayEntry<TVisit, TJob, TReminder>>
} {
  type Entry = TodayEntry<TVisit, TJob, TReminder>
  const visits: Entry[] = lists.appointments
    .filter((visit) => visit.job !== undefined)
    .map((visit) => ({ kind: 'visit', visit }))
  const reminder = (item: TReminder): Entry => ({
    kind: 'reminder',
    reminder: item,
    late: isOverdue(item.date, today),
  })
  const reminders = lists.reminders.map(reminder)
  const jobs = (items: TJob[], reason: 'late' | 'soon' | 'unpaid'): Entry[] =>
    items.map((job) => ({ kind: 'job', job, reason }))
  const all: Entry[] = [
    ...visits,
    ...reminders.filter((entry) => entry.kind === 'reminder' && entry.late),
    ...jobs(lists.overdue, 'late'),
    ...jobs(lists.dueSoon, 'soon'),
    ...reminders.filter((entry) => entry.kind === 'reminder' && !entry.late),
    ...jobs(lists.doneUnpaid, 'unpaid'),
  ]
  const first =
    all.find(
      (entry) => entry.kind === 'visit' && !visitIsOver(entry.visit, now),
    ) ??
    all.find((entry) => entry.kind !== 'visit') ??
    all.at(0)
  return { first, rest: all.filter((entry) => entry !== first) }
}
