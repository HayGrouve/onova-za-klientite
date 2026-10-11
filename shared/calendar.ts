import { addDays, daysBetween, monthRange, weekdayOf } from './dates'

/**
 * The month view on Today (D125): a "YYYY-MM" month as weeks from Monday, as
 * Bulgarian calendars start them. Days of the next or last month are blanks.
 */
export function monthGrid(month: string): Array<Array<string | null>> {
  const { from, to } = monthRange(month)
  // Monday is the first column; Sunday (0) the last.
  const lead = (weekdayOf(from) + 6) % 7
  const cells: Array<string | null> = Array<null>(lead).fill(null)
  for (let day = from; day <= to; day = addDays(day, 1)) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7))
  }
  return weeks
}

/** The month `delta` months from a "YYYY-MM" one. */
export function shiftMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1
  const next = index + delta
  const year = Math.floor(next / 12)
  return `${String(year).padStart(4, '0')}-${String((next % 12) + 1).padStart(2, '0')}`
}

/**
 * The days from `from` to `to` (both inclusive) that a visit covers: its start
 * day, or every day of a stretch such as a two-day installation.
 */
export function spanDays(
  start: string,
  end: string | undefined,
  from: string,
  to: string,
): string[] {
  const first = start < from ? from : start
  const last = (end ?? start) > to ? to : (end ?? start)
  const days = []
  for (let n = 0; n <= daysBetween(first, last); n++) {
    days.push(addDays(first, n))
  }
  return days
}

export type CalendarDay<TVisit, TJob, TReminder> = {
  visits: TVisit[]
  due: TJob[]
  reminders: TReminder[]
}

/**
 * Each day's visits (by start), jobs due and reminders, for the days that
 * have any. A stretch is under every day it covers.
 */
export function byDay<
  TVisit extends { start: number; days: string[] },
  TJob extends { dueDate?: string },
  TReminder extends { date: string },
>(month: {
  visits: TVisit[]
  due: TJob[]
  reminders: TReminder[]
}): Map<string, CalendarDay<TVisit, TJob, TReminder>> {
  const days = new Map<string, CalendarDay<TVisit, TJob, TReminder>>()
  const day = (date: string) => {
    let entry = days.get(date)
    if (!entry) {
      entry = { visits: [], due: [], reminders: [] }
      days.set(date, entry)
    }
    return entry
  }
  const visits = [...month.visits].sort((a, b) => a.start - b.start)
  for (const visit of visits) {
    for (const date of visit.days) day(date).visits.push(visit)
  }
  for (const job of month.due) if (job.dueDate) day(job.dueDate).due.push(job)
  for (const reminder of month.reminders)
    day(reminder.date).reminders.push(reminder)
  return days
}
