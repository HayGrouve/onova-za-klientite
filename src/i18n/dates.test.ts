import { describe, expect, it } from 'vitest'
import { addDays, weekdayOf } from '../../shared/dates'
import { formatActivityMoment, formatDay, formatTime } from './dates'

const WEEKDAYS = [
  'неделя',
  'понеделник',
  'вторник',
  'сряда',
  'четвъртък',
  'петък',
  'събота',
]

describe('formatDay', () => {
  it('names nearby days, otherwise weekday and date', () => {
    expect(formatDay('2026-10-07', '2026-10-07')).toBe('днес')
    expect(formatDay('2026-10-08', '2026-10-07')).toBe('утре')
    expect(formatDay('2026-10-09', '2026-10-07')).toMatch(/петък/)
  })

  it('formats times', () => {
    expect(formatTime({ hour: 9, minute: 5 })).toBe('9:05')
  })

  it('names the weekday that date really falls on', () => {
    // Read in the device's own zone, a date string could land on the day
    // before or after; this walks four years of dates.
    for (let day = 0; day < 4 * 366; day++) {
      const date = addDays('2025-01-01', day)
      const text = formatDay(date, '2020-01-01')
      expect(text.startsWith(WEEKDAYS[weekdayOf(date)]), date).toBe(true)
    }
    expect(formatDay('2026-11-07', '2026-10-08')).toMatch(/^събота, 7\.11/)
  })

  it('leaves the year out within the current year', () => {
    expect(formatDay('2026-11-07', '2026-10-08')).toBe('събота, 7.11')
    expect(formatDay('2026-01-02', '2026-10-08')).toBe('петък, 2.01')
  })

  it('adds the year to a date in another year', () => {
    // 7 Nov 2025 was a Friday and 7 Nov 2026 is a Saturday. Without the year
    // the two read as the same day with the wrong weekday.
    const before = formatDay('2025-11-07', '2026-10-08')
    const after = formatDay('2026-11-07', '2026-10-08')
    expect(before).toMatch(/^петък, 7\.11\.2025/)
    expect(after).toMatch(/^събота, 7\.11/)
    expect(before).not.toBe(after)
    expect(formatDay('2027-02-03', '2026-10-08')).toMatch(/^сряда, 3\.02\.2027/)
  })

  it('still says today, tomorrow and yesterday across New Year', () => {
    expect(formatDay('2027-01-01', '2026-12-31')).toBe('утре')
    expect(formatDay('2026-12-31', '2027-01-01')).toBe('вчера')
  })
})

describe('formatActivityMoment', () => {
  it('formats a stored date like the rest of the app', () => {
    expect(formatActivityMoment('2026-10-15', '2026-10-08')).toMatch(
      /^четвъртък, 15\.10$/,
    )
    expect(formatActivityMoment('2026-10-08', '2026-10-08')).toBe('днес')
  })

  it('adds the time of a stored date and time', () => {
    expect(formatActivityMoment('2026-10-08 14:00', '2026-10-08')).toBe(
      'днес, 14:00',
    )
    expect(formatActivityMoment('2026-10-09 9:05', '2026-10-08')).toBe(
      'утре, 9:05',
    )
    expect(formatActivityMoment('2026-10-13 10:00', '2026-10-08')).toMatch(
      /^вторник, 13\.10, 10:00$/,
    )
  })

  it('adds the year to a far date', () => {
    expect(formatActivityMoment('2027-03-04 16:30', '2026-10-08')).toMatch(
      /^четвъртък, 4\.03\.2027.*, 16:30$/,
    )
  })

  it('never shows the stored form', () => {
    for (const value of ['2026-10-08 14:00', '2026-10-15', '2025-01-02 8:00']) {
      expect(formatActivityMoment(value, '2026-10-08')).not.toMatch(/\d{4}-/)
    }
  })

  it('leaves text that is not a date as it is', () => {
    expect(formatActivityMoment('', '2026-10-08')).toBe('')
    expect(formatActivityMoment('Монтаж', '2026-10-08')).toBe('Монтаж')
  })
})
