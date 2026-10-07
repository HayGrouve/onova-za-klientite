import { describe, expect, it } from 'vitest'
import { formatDay, formatDayWithYear, formatTime } from './dates'

describe('formatDayWithYear', () => {
  it('reads as formatDay within the current year, and for the days around today', () => {
    expect(formatDayWithYear('2026-03-02', '2026-10-07')).toBe(
      formatDay('2026-03-02', '2026-10-07'),
    )
    expect(formatDayWithYear('2026-10-07', '2026-10-07')).toBe('днес')
    expect(formatDayWithYear('2025-12-31', '2026-01-01')).toBe('вчера')
  })

  it('adds the year to a date from another year', () => {
    expect(formatDayWithYear('2025-10-08', '2026-10-07')).toMatch(/2025/)
    expect(formatDayWithYear('2027-01-05', '2026-10-07')).toMatch(/2027/)
  })
})

describe('formatDay', () => {
  it('names nearby days, otherwise weekday and date', () => {
    expect(formatDay('2026-10-07', '2026-10-07')).toBe('днес')
    expect(formatDay('2026-10-08', '2026-10-07')).toBe('утре')
    expect(formatDay('2026-10-09', '2026-10-07')).toMatch(/петък/)
  })

  it('formats times', () => {
    expect(formatTime({ hour: 9, minute: 5 })).toBe('9:05')
  })
})
