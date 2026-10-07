import { addDays } from '../../shared/dates'
import { m } from '#/paraglide/messages.js'

const DAY = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
})

/** Today, tomorrow or yesterday by name, otherwise the weekday and date. */
export function formatDay(date: string, today: string) {
  if (date === today) return m.day_today()
  if (date === addDays(today, 1)) return m.day_tomorrow()
  if (date === addDays(today, -1)) return m.day_yesterday()
  return DAY.format(new Date(`${date}T12:00:00Z`))
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
