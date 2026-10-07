// Repeat (Q6, D41): how often a job repeats and which date the next job gets.
// The daily repeat run and the Job page both read the dates from here, so the
// date the screen promises is the date the run creates.

import { addDays, addMonths, dateInSofia } from './dates'

export type RepeatUnit = 'week' | 'month'
export type RepeatInterval = { every: number; unit: RepeatUnit }

/**
 * The intervals offered on a Job and in setup, shortest first. The server
 * takes any whole number from 1 to 52 weeks or months; these are the ones
 * trades actually use (a cleaner weekly, an air-conditioning service every
 * 3, 6 or 12 months).
 */
export const REPEAT_CHOICES = [
  { key: 'week', every: 1, unit: 'week' },
  { key: '2weeks', every: 2, unit: 'week' },
  { key: 'month', every: 1, unit: 'month' },
  { key: '3months', every: 3, unit: 'month' },
  { key: '6months', every: 6, unit: 'month' },
  { key: 'year', every: 12, unit: 'month' },
] as const satisfies ReadonlyArray<RepeatInterval & { key: string }>

export type RepeatKey = (typeof REPEAT_CHOICES)[number]['key']

/** One interval after `date`. Months clamp to the end of a short month. */
export function nextRepeatDate(date: string, repeat: RepeatInterval) {
  return repeat.unit === 'week'
    ? addDays(date, 7 * repeat.every)
    : addMonths(date, repeat.every)
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
