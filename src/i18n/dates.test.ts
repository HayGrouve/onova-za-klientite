import { describe, expect, it } from 'vitest'
import { formatDay, formatTime } from './dates'

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
