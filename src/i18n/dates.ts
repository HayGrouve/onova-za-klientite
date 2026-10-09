import { addDays, parseMoment } from '../../shared/dates'
import { m } from '#/paraglide/messages.js'

const DAY = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
})

// A date in another year than today's needs its year: 7 Nov 2025 and 7 Nov 2026
// would otherwise read alike, yet one is a Friday and the other a Saturday.
const DAY_AND_YEAR = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Today, tomorrow or yesterday by name, otherwise the weekday and date, with
 * the year when it isn't this year.
 */
export function formatDay(date: string, today: string) {
  if (date === today) return m.day_today()
  if (date === addDays(today, 1)) return m.day_tomorrow()
  if (date === addDays(today, -1)) return m.day_yesterday()
  // Noon UTC, formatted in UTC: the same calendar day in any device time zone.
  const noon = new Date(`${date}T12:00:00Z`)
  return (date.slice(0, 4) === today.slice(0, 4) ? DAY : DAY_AND_YEAR).format(
    noon,
  )
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'short',
  timeZone: 'UTC',
})

/**
 * A day for a narrow cell: today, tomorrow or yesterday by name, otherwise the
 * short weekday and date (Fri, 16.10), or the plain date with its year when
 * it isn't this year (12.10.2025), so it never needs a second line.
 */
export function formatDayShort(date: string, today: string) {
  if (date === today) return m.day_today()
  if (date === addDays(today, 1)) return m.day_tomorrow()
  if (date === addDays(today, -1)) return m.day_yesterday()
  const [year, month, day] = date.split('-').map(Number)
  if (String(year) !== today.slice(0, 4)) return `${day}.${month}.${year}`
  const weekday = SHORT_WEEKDAY.format(new Date(`${date}T12:00:00Z`))
  return `${weekday}, ${day}.${month}`
}

// A date months away needs its year, so it can't be read as this year's.
const LONG_DAY = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The whole date with its year: for dates a few months or more ahead. */
export function formatLongDay(date: string) {
  return LONG_DAY.format(new Date(`${date}T12:00:00Z`))
}

export function formatTime(time: { hour: number; minute: number }) {
  return `${time.hour}:${String(time.minute).padStart(2, '0')}`
}

/**
 * A date, or date and time, that the activity log stored as text ("2026-10-08
 * 14:00"), shown like the rest of the app. Text that isn't one is left as is.
 */
export function formatActivityMoment(value: string, today: string) {
  const moment = parseMoment(value)
  if (!moment) return value
  const day = formatDay(moment.date, today)
  return moment.time ? `${day}, ${formatTime(moment.time)}` : day
}
