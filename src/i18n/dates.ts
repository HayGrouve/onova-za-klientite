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

const DAY_YEAR = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * formatDay, plus the year for a date outside this year, for history where
 * "when was it last done?" needs the year. Yesterday stays yesterday across New Year.
 */
export function formatDayWithYear(date: string, today: string) {
  const near = [today, addDays(today, 1), addDays(today, -1)].includes(date)
  if (near || date.slice(0, 4) === today.slice(0, 4)) {
    return formatDay(date, today)
  }
  return DAY_YEAR.format(new Date(`${date}T12:00:00Z`))
}

export function formatTime(time: { hour: number; minute: number }) {
  return `${time.hour}:${String(time.minute).padStart(2, '0')}`
}
