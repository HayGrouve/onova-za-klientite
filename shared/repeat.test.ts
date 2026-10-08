import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { sofiaTimeToUtc } from './dates'
import {
  REPEAT_CHOICES,
  nextJobDate,
  nextRepeatDate,
  pickJobDate,
} from './repeat'

const at = (date: string, hour = 9, minute = 0) =>
  sofiaTimeToUtc(date, hour, minute)

describe('REPEAT_CHOICES', () => {
  it('offers week, 2 weeks, month, 2, 3 and 6 months, and year, in that order', () => {
    expect(
      REPEAT_CHOICES.map(({ key, every, unit }) => [key, every, unit]),
    ).toEqual([
      ['week', 1, 'week'],
      ['2weeks', 2, 'week'],
      ['month', 1, 'month'],
      ['2months', 2, 'month'],
      ['3months', 3, 'month'],
      ['6months', 6, 'month'],
      ['year', 12, 'month'],
    ])
  })

  it('every choice is one the server accepts (a whole number from 1 to 52)', () => {
    for (const { every } of REPEAT_CHOICES) {
      expect(Number.isInteger(every) && every >= 1 && every <= 52).toBe(true)
    }
  })
})

describe('nextRepeatDate', () => {
  it('adds whole weeks', () => {
    expect(nextRepeatDate('2026-10-07', { every: 1, unit: 'week' })).toBe(
      '2026-10-14',
    )
    expect(nextRepeatDate('2026-10-07', { every: 2, unit: 'week' })).toBe(
      '2026-10-21',
    )
  })

  it('adds calendar months and clamps to the end of a short month', () => {
    expect(nextRepeatDate('2026-01-31', { every: 1, unit: 'month' })).toBe(
      '2026-02-28',
    )
    expect(nextRepeatDate('2026-11-30', { every: 3, unit: 'month' })).toBe(
      '2027-02-28',
    )
    expect(nextRepeatDate('2026-10-07', { every: 6, unit: 'month' })).toBe(
      '2027-04-07',
    )
  })

  it('a year is twelve months, leap day included', () => {
    expect(nextRepeatDate('2026-10-07', { every: 12, unit: 'month' })).toBe(
      '2027-10-07',
    )
    expect(nextRepeatDate('2028-02-29', { every: 12, unit: 'month' })).toBe(
      '2029-02-28',
    )
  })

  it('always lands after the date it started from', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }),
        fc.constantFrom(...REPEAT_CHOICES),
        (days, choice) => {
          const date = new Date(Date.UTC(2000, 0, 1) + days * 86_400_000)
            .toISOString()
            .slice(0, 10)
          expect(nextRepeatDate(date, choice) > date).toBe(true)
        },
      ),
    )
  })
})

describe('pickJobDate (D41)', () => {
  it('is the last appointment that is not cancelled, as a Sofia date', () => {
    const found = pickJobDate({
      appointments: [
        { start: at('2026-10-05') },
        { start: at('2026-10-09') },
        { start: at('2026-10-07') },
      ],
      dueDate: '2026-12-01',
    })
    expect(found?.date).toBe('2026-10-09')
    expect(found?.appointment?.start).toBe(at('2026-10-09'))
  })

  it('reads the date in Sofia, not in UTC', () => {
    // 00:30 in Sofia is still the day before in UTC.
    expect(
      pickJobDate({ appointments: [{ start: at('2026-10-09', 0, 30) }] })?.date,
    ).toBe('2026-10-09')
  })

  it('skips cancelled appointments', () => {
    const found = pickJobDate({
      appointments: [
        { start: at('2026-10-05') },
        { start: at('2026-10-20'), cancelledAt: 1 },
      ],
    })
    expect(found?.date).toBe('2026-10-05')
  })

  it('falls back to the due date when no appointment is left', () => {
    expect(
      pickJobDate({
        appointments: [{ start: at('2026-10-20'), cancelledAt: 1 }],
        dueDate: '2026-11-03',
      }),
    ).toEqual({ date: '2026-11-03' })
    expect(pickJobDate({ appointments: [], dueDate: '2026-11-03' })).toEqual({
      date: '2026-11-03',
    })
  })

  it('is null for a job with neither, which cannot repeat', () => {
    expect(pickJobDate({ appointments: [] })).toBeNull()
    expect(
      pickJobDate({
        appointments: [{ start: at('2026-10-20'), cancelledAt: 1 }],
      }),
    ).toBeNull()
  })
})

describe('nextJobDate', () => {
  it('is the job’s date plus one interval', () => {
    expect(
      nextJobDate(
        { appointments: [{ start: at('2026-10-07') }] },
        { every: 3, unit: 'month' },
      ),
    ).toBe('2027-01-07')
    expect(
      nextJobDate(
        { appointments: [], dueDate: '2026-10-07' },
        {
          every: 1,
          unit: 'week',
        },
      ),
    ).toBe('2026-10-14')
  })

  it('is null when the job has no date', () => {
    expect(
      nextJobDate({ appointments: [] }, { every: 1, unit: 'month' }),
    ).toBeNull()
  })
})
