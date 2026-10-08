// Calendar dates are "YYYY-MM-DD" strings in Europe/Sofia, moments are epoch
// ms. The EU daylight-saving rule is coded here so nothing depends on the
// runtime's time-zone data.

const MINUTE = 60_000
const DAY = 86_400_000

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function parts(date: string): [number, number, number] {
  return [
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  ]
}

function toDayNumber(date: string): number {
  const [y, m, d] = parts(date)
  return Math.round(Date.UTC(y, m - 1, d) / DAY)
}

function fromDayNumber(day: number): string {
  const d = new Date(day * DAY)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function lastSundayUtc(year: number, monthIndex: number): number {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0))
  return Date.UTC(year, monthIndex, last.getUTCDate() - last.getUTCDay(), 1)
}

/** 120 in winter, 180 in summer. */
export function sofiaOffsetMinutes(ms: number): number {
  const year = new Date(ms).getUTCFullYear()
  return ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9) ? 180 : 120
}

export function dateInSofia(ms: number): string {
  return fromDayNumber(Math.floor((ms + sofiaOffsetMinutes(ms) * MINUTE) / DAY))
}

/** What the Sofia wall clock reads at that moment. */
export function clockInSofia(ms: number): { hour: number; minute: number } {
  const local = ms + sofiaOffsetMinutes(ms) * MINUTE
  const minuteOfDay = Math.floor((((local % DAY) + DAY) % DAY) / MINUTE)
  return { hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 }
}

/**
 * A moment as Sofia reads it, for places that must say exactly when
 * ("8.10.2026, 15:01"): day and month as the rest of the app writes them, the
 * whole year, and a 24-hour clock that always has its minutes.
 */
export function formatDateTime(ms: number): string {
  const [y, m, d] = parts(dateInSofia(ms))
  const { hour, minute } = clockInSofia(ms)
  return `${d}.${m}.${y}, ${pad(hour)}:${pad(minute)}`
}

export function todayInSofia(nowMs: number): string {
  return dateInSofia(nowMs)
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [y, m, d] = parts(date)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days)
}

/** Clamps to the end of the month: 2026-01-31 + 1 month = 2026-02-28. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date)
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = (((index % 12) + 12) % 12) + 1
  const day = Math.min(d, daysInMonth(year, month))
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from)
}

/** A calendar month as "YYYY-MM". */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** First and last day of a "YYYY-MM" month, both inclusive. */
export function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return {
    from: `${month}-01`,
    to: `${month}-${pad(daysInMonth(year, m))}`,
  }
}

export function isOverdue(dueDate: string | undefined, today: string): boolean {
  return dueDate !== undefined && dueDate < today
}

export function isDueSoon(
  dueDate: string | undefined,
  today: string,
  days = 3,
): boolean {
  return (
    dueDate !== undefined && dueDate >= today && dueDate <= addDays(today, days)
  )
}

/**
 * A date, or a date and a Sofia time, as text for the activity log: the
 * history keeps "2026-10-08 14:00" and shows it in the reader's own format.
 */
export function stampMoment(
  date: string,
  time?: { hour: number; minute: number },
): string {
  return time ? `${date} ${time.hour}:${pad(time.minute)}` : date
}

/** Reads what `stampMoment` wrote. Anything else is not a moment. */
export function parseMoment(
  text: string,
): { date: string; time?: { hour: number; minute: number } } | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})(?: (\d{1,2}):(\d{2}))?$/.exec(text)
  if (!match || !isValidDate(match[1])) return undefined
  // The time group is absent when the text is a date alone.
  const groups: Array<string | undefined> = match
  if (groups[2] === undefined) return { date: match[1] }
  const hour = Number(groups[2])
  const minute = Number(groups[3])
  if (hour > 23 || minute > 59) return undefined
  return { date: match[1], time: { hour, minute } }
}

/** Sunday is 0. */
export function weekdayOf(date: string): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7
}

// Every instant at which the Sofia clock reads this time, earliest first. A
// repeated time (autumn) gives two, a skipped time (spring) is moved forward.
function instantsOf(date: string, hour: number, minute: number): number[] {
  const [y, m, d] = parts(date)
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  const found = [180, 120]
    .map((offset) => wall - offset * MINUTE)
    .filter((ms) => sofiaOffsetMinutes(ms) * MINUTE === wall - ms)
    .sort((a, b) => a - b)
  return found.length > 0 ? found : [wall - 120 * MINUTE]
}

/** Epoch ms of that Sofia wall-clock time. The first one when it happens twice. */
export function sofiaTimeToUtc(
  date: string,
  hour: number,
  minute: number,
): number {
  return instantsOf(date, hour, minute)[0]
}

/** The next moment strictly after nowMs when the Sofia clock reads hour:minute. */
export function nextSofiaTime(
  nowMs: number,
  hour: number,
  minute: number,
): number {
  const today = dateInSofia(nowMs)
  const candidates = [
    ...instantsOf(today, hour, minute),
    ...instantsOf(addDays(today, 1), hour, minute),
  ]
  return candidates.find((ms) => ms > nowMs) as number
}
