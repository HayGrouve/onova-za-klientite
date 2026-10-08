import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  clockInSofia,
  formatDateTime,
  addDays,
  addMonths,
  dateInSofia,
  daysBetween,
  isDueSoon,
  isOverdue,
  isValidDate,
  isValidMonth,
  monthOf,
  monthRange,
  nextSofiaTime,
  parseMoment,
  sofiaOffsetMinutes,
  sofiaTimeToUtc,
  stampMoment,
  todayInSofia,
  weekdayOf,
} from './dates'

const utc = (iso: string) => Date.parse(iso)
const iso = (ms: number) => new Date(ms).toISOString()

describe('sofiaOffsetMinutes', () => {
  it('is +2 in winter and +3 in summer', () => {
    expect(sofiaOffsetMinutes(utc('2026-01-15T12:00:00Z'))).toBe(120)
    expect(sofiaOffsetMinutes(utc('2026-07-15T12:00:00Z'))).toBe(180)
  })

  it('switches at 01:00 UTC on the last Sunday of March 2026', () => {
    expect(sofiaOffsetMinutes(utc('2026-03-29T00:59:59.999Z'))).toBe(120)
    expect(sofiaOffsetMinutes(utc('2026-03-29T01:00:00Z'))).toBe(180)
  })

  it('switches back at 01:00 UTC on the last Sunday of October 2026', () => {
    expect(sofiaOffsetMinutes(utc('2026-10-25T00:59:59.999Z'))).toBe(180)
    expect(sofiaOffsetMinutes(utc('2026-10-25T01:00:00Z'))).toBe(120)
  })

  it('matches the known changeover days of other years', () => {
    expect(sofiaOffsetMinutes(utc('2027-03-28T00:59:59Z'))).toBe(120)
    expect(sofiaOffsetMinutes(utc('2027-03-28T01:00:00Z'))).toBe(180)
    expect(sofiaOffsetMinutes(utc('2027-10-31T01:00:00Z'))).toBe(120)
    expect(sofiaOffsetMinutes(utc('2025-03-30T01:00:00Z'))).toBe(180)
    expect(sofiaOffsetMinutes(utc('2025-10-26T01:00:00Z'))).toBe(120)
  })

  it('agrees with the runtime time-zone database when it has one', () => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Sofia',
      timeZoneName: 'shortOffset',
    })
    const part = (ms: number) =>
      fmt.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value
    if (part(utc('2026-07-01T00:00:00Z')) !== 'GMT+3') return
    fc.assert(
      fc.property(
        fc.integer({
          min: utc('2020-01-01T00:00:00Z'),
          max: utc('2035-12-31T00:00:00Z'),
        }),
        (ms) => {
          expect(`GMT+${sofiaOffsetMinutes(ms) / 60}`).toBe(part(ms))
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('todayInSofia and dateInSofia', () => {
  it('rolls over at Sofia midnight in winter', () => {
    expect(todayInSofia(utc('2026-01-10T21:59:59.999Z'))).toBe('2026-01-10')
    expect(todayInSofia(utc('2026-01-10T22:00:00Z'))).toBe('2026-01-11')
  })

  it('rolls over at Sofia midnight in summer', () => {
    expect(todayInSofia(utc('2026-07-01T20:59:59.999Z'))).toBe('2026-07-01')
    expect(todayInSofia(utc('2026-07-01T21:00:00Z'))).toBe('2026-07-02')
  })

  it('handles the March changeover day', () => {
    expect(todayInSofia(utc('2026-03-28T21:59:59.999Z'))).toBe('2026-03-28')
    expect(todayInSofia(utc('2026-03-28T22:00:00Z'))).toBe('2026-03-29')
    expect(todayInSofia(utc('2026-03-29T01:00:00Z'))).toBe('2026-03-29')
    expect(todayInSofia(utc('2026-03-29T20:59:59.999Z'))).toBe('2026-03-29')
    expect(todayInSofia(utc('2026-03-29T21:00:00Z'))).toBe('2026-03-30')
  })

  it('handles the October changeover day', () => {
    expect(todayInSofia(utc('2026-10-24T20:59:59.999Z'))).toBe('2026-10-24')
    expect(todayInSofia(utc('2026-10-24T21:00:00Z'))).toBe('2026-10-25')
    expect(todayInSofia(utc('2026-10-25T01:30:00Z'))).toBe('2026-10-25')
    expect(todayInSofia(utc('2026-10-25T21:59:59.999Z'))).toBe('2026-10-25')
    expect(todayInSofia(utc('2026-10-25T22:00:00Z'))).toBe('2026-10-26')
  })

  it('is the same function as dateInSofia', () => {
    const ms = utc('2026-05-05T10:00:00Z')
    expect(dateInSofia(ms)).toBe(todayInSofia(ms))
  })
})

describe('isValidDate', () => {
  it.each(['2026-01-31', '2024-02-29', '2026-12-01'])('accepts %s', (d) => {
    expect(isValidDate(d)).toBe(true)
  })

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-1',
    '26-01-01',
    '',
    'abc',
    '2026-01-01T00:00',
    ' 2026-01-01',
  ])('rejects %j', (d) => {
    expect(isValidDate(d)).toBe(false)
  })
})

describe('addDays, daysBetween, weekdayOf', () => {
  it('adds across months and years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-02-01', '2026-01-01')).toBe(-31)
    expect(daysBetween('2026-05-05', '2026-05-05')).toBe(0)
  })

  it('knows the weekday', () => {
    expect(weekdayOf('2026-03-29')).toBe(0)
    expect(weekdayOf('2026-10-25')).toBe(0)
    expect(weekdayOf('2026-10-07')).toBe(3)
    expect(weekdayOf('2000-01-01')).toBe(6)
  })

  const date = fc
    .integer({ min: 0, max: 60_000 })
    .map((n) => addDays('1970-01-01', n))

  it('round-trips with daysBetween and stays valid', () => {
    fc.assert(
      fc.property(date, fc.integer({ min: -5000, max: 5000 }), (d, n) => {
        const moved = addDays(d, n)
        expect(isValidDate(moved)).toBe(true)
        expect(daysBetween(d, moved)).toBe(n)
        expect(addDays(moved, -n)).toBe(d)
      }),
    )
  })

  it('advances the weekday by one a day', () => {
    fc.assert(
      fc.property(date, (d) => {
        expect(weekdayOf(addDays(d, 1))).toBe((weekdayOf(d) + 1) % 7)
      }),
    )
  })
})

describe('addMonths', () => {
  it('clamps to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('crosses years', () => {
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15')
    expect(addMonths('2026-05-10', 12)).toBe('2027-05-10')
    expect(addMonths('2026-05-10', 0)).toBe('2026-05-10')
  })

  it('always gives a valid date', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 0, max: 40_000 })
          .map((n) => addDays('1990-01-01', n)),
        fc.integer({ min: -240, max: 240 }),
        (d, n) => {
          expect(isValidDate(addMonths(d, n))).toBe(true)
        },
      ),
    )
  })
})

describe('monthOf and monthRange', () => {
  it('reads the month', () => {
    expect(monthOf('2026-10-07')).toBe('2026-10')
  })

  it('gives inclusive ranges', () => {
    expect(monthRange('2026-10')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(monthRange('2026-02')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(monthRange('2024-02')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    })
    expect(monthRange('2026-12')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
  })
})

describe('isOverdue and isDueSoon', () => {
  const today = '2026-10-07'

  it('is overdue strictly before today', () => {
    expect(isOverdue('2026-10-06', today)).toBe(true)
    expect(isOverdue('2026-10-07', today)).toBe(false)
    expect(isOverdue('2026-10-08', today)).toBe(false)
    expect(isOverdue(undefined, today)).toBe(false)
  })

  it('is due soon from today through today + days', () => {
    expect(isDueSoon('2026-10-06', today)).toBe(false)
    expect(isDueSoon('2026-10-07', today)).toBe(true)
    expect(isDueSoon('2026-10-10', today)).toBe(true)
    expect(isDueSoon('2026-10-11', today)).toBe(false)
    expect(isDueSoon('2026-10-11', today, 4)).toBe(true)
    expect(isDueSoon(undefined, today)).toBe(false)
  })
})

describe('sofiaTimeToUtc', () => {
  it('uses +2 in winter and +3 in summer', () => {
    expect(iso(sofiaTimeToUtc('2026-01-15', 7, 30))).toBe(
      '2026-01-15T05:30:00.000Z',
    )
    expect(iso(sofiaTimeToUtc('2026-07-15', 7, 30))).toBe(
      '2026-07-15T04:30:00.000Z',
    )
  })

  it('handles the changeover days', () => {
    expect(iso(sofiaTimeToUtc('2026-03-29', 2, 30))).toBe(
      '2026-03-29T00:30:00.000Z',
    )
    expect(iso(sofiaTimeToUtc('2026-03-29', 7, 30))).toBe(
      '2026-03-29T04:30:00.000Z',
    )
    expect(iso(sofiaTimeToUtc('2026-10-25', 2, 30))).toBe(
      '2026-10-24T23:30:00.000Z',
    )
    expect(iso(sofiaTimeToUtc('2026-10-25', 7, 30))).toBe(
      '2026-10-25T05:30:00.000Z',
    )
  })

  it('moves a skipped wall-clock time forward', () => {
    expect(iso(sofiaTimeToUtc('2026-03-29', 3, 30))).toBe(
      '2026-03-29T01:30:00.000Z',
    )
  })

  it('takes the first of a repeated wall-clock time', () => {
    expect(iso(sofiaTimeToUtc('2026-10-25', 3, 30))).toBe(
      '2026-10-25T00:30:00.000Z',
    )
  })

  it('reads back as the same date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }).map((n) => addDays('2024-01-01', n)),
        fc.integer({ min: 5, max: 22 }),
        fc.integer({ min: 0, max: 59 }),
        (d, h, m) => {
          const ms = sofiaTimeToUtc(d, h, m)
          expect(dateInSofia(ms)).toBe(d)
          const local = new Date(ms + sofiaOffsetMinutes(ms) * 60_000)
          expect(local.getUTCHours()).toBe(h)
          expect(local.getUTCMinutes()).toBe(m)
        },
      ),
    )
  })
})

describe('nextSofiaTime', () => {
  it('picks later today or tomorrow, strictly after now', () => {
    expect(iso(nextSofiaTime(utc('2026-01-15T03:00:00Z'), 7, 30))).toBe(
      '2026-01-15T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-01-15T05:30:00Z'), 7, 30))).toBe(
      '2026-01-16T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-01-15T05:29:59.999Z'), 7, 30))).toBe(
      '2026-01-15T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-01-15T20:00:00Z'), 7, 30))).toBe(
      '2026-01-16T05:30:00.000Z',
    )
  })

  it('crosses Sofia midnight, not UTC midnight', () => {
    expect(iso(nextSofiaTime(utc('2026-01-15T22:30:00Z'), 7, 30))).toBe(
      '2026-01-16T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-07-15T21:30:00Z'), 7, 30))).toBe(
      '2026-07-16T04:30:00.000Z',
    )
  })

  it('handles 29 March 2026 (clocks go forward)', () => {
    expect(iso(nextSofiaTime(utc('2026-03-28T05:30:00Z'), 7, 30))).toBe(
      '2026-03-29T04:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-03-28T20:00:00Z'), 7, 30))).toBe(
      '2026-03-29T04:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-03-29T00:30:00Z'), 7, 30))).toBe(
      '2026-03-29T04:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-03-29T04:30:00Z'), 7, 30))).toBe(
      '2026-03-30T04:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-03-29T10:00:00Z'), 7, 30))).toBe(
      '2026-03-30T04:30:00.000Z',
    )
  })

  it('handles 25 October 2026 (clocks go back)', () => {
    expect(iso(nextSofiaTime(utc('2026-10-24T04:30:00Z'), 7, 30))).toBe(
      '2026-10-25T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-10-24T20:00:00Z'), 7, 30))).toBe(
      '2026-10-25T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-10-25T01:30:00Z'), 7, 30))).toBe(
      '2026-10-25T05:30:00.000Z',
    )
    expect(iso(nextSofiaTime(utc('2026-10-25T05:30:00Z'), 7, 30))).toBe(
      '2026-10-26T05:30:00.000Z',
    )
  })

  it('finds both passes of a repeated wall-clock time', () => {
    expect(iso(nextSofiaTime(utc('2026-10-25T00:30:00Z'), 3, 30))).toBe(
      '2026-10-25T01:30:00.000Z',
    )
  })

  it('always reads the requested time and is less than a day and an hour away', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: utc('2025-01-01T00:00:00Z'),
          max: utc('2028-12-31T00:00:00Z'),
        }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (now, h, m) => {
          const next = nextSofiaTime(now, h, m)
          expect(next).toBeGreaterThan(now)
          expect(next - now).toBeLessThanOrEqual(25 * 3_600_000)
          const local = new Date(next + sofiaOffsetMinutes(next) * 60_000)
          // A wall-clock time inside the spring gap is moved one hour forward
          const inGap =
            local.getUTCHours() === h + 1 && local.getUTCMinutes() === m
          expect(
            (local.getUTCHours() === h && local.getUTCMinutes() === m) || inGap,
          ).toBe(true)
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('stampMoment and parseMoment', () => {
  it('writes a date, or a date and time, the way the activity log keeps it', () => {
    expect(stampMoment('2026-10-15')).toBe('2026-10-15')
    expect(stampMoment('2026-10-08', { hour: 14, minute: 0 })).toBe(
      '2026-10-08 14:00',
    )
    expect(stampMoment('2026-10-08', { hour: 9, minute: 5 })).toBe(
      '2026-10-08 9:05',
    )
  })

  it('reads them back', () => {
    expect(parseMoment('2026-10-15')).toEqual({ date: '2026-10-15' })
    expect(parseMoment('2026-10-08 14:00')).toEqual({
      date: '2026-10-08',
      time: { hour: 14, minute: 0 },
    })
    expect(parseMoment('2026-10-08 9:05')).toEqual({
      date: '2026-10-08',
      time: { hour: 9, minute: 5 },
    })
  })

  it('reads nothing else as a moment', () => {
    for (const text of [
      '',
      'Монтаж',
      '2026-13-01',
      '2026-02-30',
      '2026-10-08 25:00',
      '2026-10-08 14:60',
      '2026-10-08T14:00',
      '2026-10-08 14:00 extra',
      'x 2026-10-08',
    ]) {
      expect(parseMoment(text), text).toBeUndefined()
    }
  })

  it('round-trips any valid date and time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }),
        fc.option(
          fc.record({
            hour: fc.integer({ min: 0, max: 23 }),
            minute: fc.integer({ min: 0, max: 59 }),
          }),
          { nil: undefined },
        ),
        (offset, time) => {
          const date = addDays('2000-01-01', offset)
          expect(parseMoment(stampMoment(date, time))).toEqual({
            date,
            ...(time && { time }),
          })
        },
      ),
    )
  })
})

describe('isValidMonth', () => {
  it('is a year and a month 01–12', () => {
    expect(isValidMonth('2026-10')).toBe(true)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026-00')).toBe(false)
    expect(isValidMonth('2026-1')).toBe(false)
    expect(isValidMonth('2026-10-01')).toBe(false)
  })
})

describe('formatDateTime', () => {
  it('reads a summer moment on the 24-hour clock, with its minutes', () => {
    expect(formatDateTime(Date.UTC(2026, 9, 8, 0, 1))).toBe('8.10.2026, 03:01')
    expect(formatDateTime(Date.UTC(2026, 9, 8, 12, 0))).toBe('8.10.2026, 15:00')
  })

  it('reads a winter moment, and crosses midnight into the next Sofia day', () => {
    expect(formatDateTime(Date.UTC(2026, 0, 5, 22, 30))).toBe('6.1.2026, 00:30')
    expect(formatDateTime(Date.UTC(2026, 0, 5, 12, 5))).toBe('5.1.2026, 14:05')
  })

  it('follows the clock change', () => {
    // 2026-03-29 01:00 UTC is when summer time starts: 03:00 -> 04:00.
    expect(formatDateTime(Date.UTC(2026, 2, 29, 0, 59))).toBe(
      '29.3.2026, 02:59',
    )
    expect(formatDateTime(Date.UTC(2026, 2, 29, 1, 0))).toBe('29.3.2026, 04:00')
  })
})

describe('clockInSofia', () => {
  it('reads the Sofia wall clock, summer and winter', () => {
    expect(clockInSofia(Date.UTC(2026, 9, 8, 0, 1))).toEqual({
      hour: 3,
      minute: 1,
    })
    expect(clockInSofia(Date.UTC(2026, 0, 5, 22, 30))).toEqual({
      hour: 0,
      minute: 30,
    })
  })
})
