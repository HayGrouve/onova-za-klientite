import { describe, expect, it } from 'vitest'
import { formatDay, formatLongDay, formatTime } from './dates'

describe('formatDay', () => {
  it('names nearby days, otherwise weekday and date', () => {
    expect(formatDay('2026-10-07', '2026-10-07')).toBe('днес')
    expect(formatDay('2026-10-08', '2026-10-07')).toBe('утре')
    expect(formatDay('2026-10-09', '2026-10-07')).toMatch(/петък/)
  })

  it('writes a far-off date in full, with its year', () => {
    expect(formatLongDay('2027-01-07')).toBe('7 януари 2027 г.')
    expect(formatLongDay('2026-10-14')).toBe('14 октомври 2026 г.')
  })

  it('formats times', () => {
    expect(formatTime({ hour: 9, minute: 5 })).toBe('9:05')
  })
})
