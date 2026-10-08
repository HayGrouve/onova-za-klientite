// Repeat (Q6, D41): how often a job repeats and which date the next job gets.
// The daily repeat run and the Job page both read the dates from here, so the
// date the screen promises is the date the run creates.

import { addDays, addMonths, dateInSofia, daysInMonth } from './dates'

export type RepeatUnit = 'week' | 'month'
export type RepeatInterval = {
  every: number
  unit: RepeatUnit
  /**
   * The day of the month a monthly series keeps (the 31st, say), when a short
   * month pulled an earlier job to the 28th. Absent on the first job.
   */
  anchorDay?: number
}

/**
 * The intervals offered on a Job and in setup, shortest first. The server
 * takes any whole number from 1 to 52 weeks or months; these are the ones
 * trades actually use (a cleaner weekly, a groomer every 2 months, an
 * air-conditioning service every 3, 6 or 12 months).
 */
export const REPEAT_CHOICES = [
  { key: 'week', every: 1, unit: 'week' },
  { key: '2weeks', every: 2, unit: 'week' },
  { key: 'month', every: 1, unit: 'month' },
  { key: '2months', every: 2, unit: 'month' },
  { key: '3months', every: 3, unit: 'month' },
  { key: '6months', every: 6, unit: 'month' },
  { key: 'year', every: 12, unit: 'month' },
] as const satisfies ReadonlyArray<RepeatInterval & { key: string }>

export type RepeatKey = (typeof REPEAT_CHOICES)[number]['key']

function dayYearMonth(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/**
 * The day of the month a series is on at `date`: the anchor while the job is
 * still on it (or on the end of a month too short for it), else the job's own
 * day, as when someone moved the job. Weeks have none.
 */
export function repeatAnchorDay(date: string, repeat: RepeatInterval) {
  if (repeat.unit === 'week') return undefined
  const { year, month, day } = dayYearMonth(date)
  const anchor = repeat.anchorDay
  return anchor !== undefined &&
    day === Math.min(anchor, daysInMonth(year, month))
    ? anchor
    : day
}

/**
 * One interval after `date`. Months clamp to the end of a short month, and a
 * series that was clamped goes back to its day once the month is long enough
 * (31 Jan, 28 Feb, 31 Mar), instead of drifting to the 28th for good.
 */
export function nextRepeatDate(date: string, repeat: RepeatInterval) {
  if (repeat.unit === 'week') return addDays(date, 7 * repeat.every)
  const next = addMonths(date, repeat.every)
  const day = repeatAnchorDay(date, repeat) ?? 1
  const { year, month } = dayYearMonth(next)
  return `${next.slice(0, 8)}${String(Math.min(day, daysInMonth(year, month))).padStart(2, '0')}`
}

/**
 * A job's date for repeating (D41): its last appointment that is not
 * cancelled, else its due date, else none and the job can't repeat. The
 * appointment is returned too, because the next job copies its time of day.
 */
export function pickJobDate<
  TAppointment extends { start: number; cancelledAt?: number },
>(job: { appointments: readonly TAppointment[]; dueDate?: string }) {
  const last = job.appointments
    .filter((item) => item.cancelledAt === undefined)
    .sort((a, b) => b.start - a.start)
    .at(0)
  if (last) return { date: dateInSofia(last.start), appointment: last }
  return job.dueDate ? { date: job.dueDate } : null
}

/** The date the next job in the series gets, or null when this job has no date. */
export function nextJobDate(
  job: {
    appointments: readonly { start: number; cancelledAt?: number }[]
    dueDate?: string
  },
  repeat: RepeatInterval,
) {
  const when = pickJobDate(job)
  return when ? nextRepeatDate(when.date, repeat) : null
}
