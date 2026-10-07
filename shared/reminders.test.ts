import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addMonths } from './dates'
import {
  REMINDER_PICKS,
  SNOOZE_PICKS,
  matchingPick,
  pickReminderDate,
} from './reminders'

describe('pickReminderDate', () => {
  it('counts from today, in Sofia dates', () => {
    expect(pickReminderDate('2026-10-08', 'tomorrow')).toBe('2026-10-09')
    expect(pickReminderDate('2026-10-08', 'week')).toBe('2026-10-15')
    expect(pickReminderDate('2026-10-08', 'month')).toBe('2026-11-08')
    expect(pickReminderDate('2026-10-08', '3months')).toBe('2027-01-08')
    expect(pickReminderDate('2026-10-08', '6months')).toBe('2027-04-08')
    expect(pickReminderDate('2026-10-08', 'year')).toBe('2027-10-08')
  })

  it('crosses the end of the month and the year', () => {
    expect(pickReminderDate('2026-12-31', 'tomorrow')).toBe('2027-01-01')
    expect(pickReminderDate('2026-12-28', 'week')).toBe('2027-01-04')
  })

  it('clamps to the end of a short month, as the reminder rule does', () => {
    expect(pickReminderDate('2026-01-31', 'month')).toBe('2026-02-28')
    expect(pickReminderDate('2026-11-30', '3months')).toBe('2027-02-28')
    expect(pickReminderDate('2028-02-29', 'year')).toBe('2029-02-28')
    for (const months of [1, 3, 6, 12]) {
      const pick = (
        { 1: 'month', 3: '3months', 6: '6months', 12: 'year' } as const
      )[months as 1 | 3 | 6 | 12]
      expect(pickReminderDate('2026-08-31', pick)).toBe(
        addMonths('2026-08-31', months),
      )
    }
  })

  it('every pick is later than the one before it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (days) => {
        const today = new Date(Date.UTC(2000, 0, 1) + days * 86_400_000)
          .toISOString()
          .slice(0, 10)
        const dates = REMINDER_PICKS.map((pick) =>
          pickReminderDate(today, pick),
        )
        expect(dates[0] > today).toBe(true)
        expect(dates).toEqual([...dates].sort())
        expect(new Set(dates).size).toBe(dates.length)
      }),
    )
  })
})

describe('the picks', () => {
  it('offers tomorrow, a week, a month, 3 months, 6 months and a year', () => {
    expect([...REMINDER_PICKS]).toEqual([
      'tomorrow',
      'week',
      'month',
      '3months',
      '6months',
      'year',
    ])
  })

  it('snoozing offers the short ones only', () => {
    expect([...SNOOZE_PICKS]).toEqual(['tomorrow', 'week', 'month'])
    for (const pick of SNOOZE_PICKS) expect(REMINDER_PICKS).toContain(pick)
  })
})

describe('matchingPick', () => {
  it('finds the pick a date came from, so its chip can show as chosen', () => {
    expect(matchingPick('2026-10-08', '2026-10-15')).toBe('week')
    expect(matchingPick('2026-10-08', '2027-10-08')).toBe('year')
  })

  it('is undefined for any other date', () => {
    expect(matchingPick('2026-10-08', '2026-10-08')).toBeUndefined()
    expect(matchingPick('2026-10-08', '2026-10-20')).toBeUndefined()
    expect(matchingPick('2026-10-08', '')).toBeUndefined()
  })
})
