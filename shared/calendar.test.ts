import { describe, expect, it } from 'vitest'
import { byDay, monthGrid, shiftMonth, spanDays } from './calendar'

describe('monthGrid', () => {
  it('lays a month out in weeks from Monday, blanks around it', () => {
    // 1 October 2026 is a Thursday; the 31st a Saturday.
    const weeks = monthGrid('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(weeks[4]).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ])
    expect(weeks.every((week) => week.length === 7)).toBe(true)
  })

  it('a February from Monday to Sunday fills four rows exactly', () => {
    // February 2027 starts on a Monday and has 28 days.
    const weeks = monthGrid('2027-02')
    expect(weeks).toHaveLength(4)
    expect(weeks[0][0]).toBe('2027-02-01')
    expect(weeks[3][6]).toBe('2027-02-28')
  })

  it('a month starting on Sunday takes six rows', () => {
    // 1 November 2026 is a Sunday; 30 days.
    const weeks = monthGrid('2026-11')
    expect(weeks).toHaveLength(6)
    expect(weeks[0]).toEqual([...Array<null>(6).fill(null), '2026-11-01'])
    expect(weeks[5][0]).toBe('2026-11-30')
  })
})

describe('shiftMonth', () => {
  it('steps over the year in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', 14)).toBe('2027-12')
  })
})

describe('spanDays', () => {
  it('a one-day visit is on its day', () => {
    expect(
      spanDays('2026-10-14', undefined, '2026-10-01', '2026-10-31'),
    ).toEqual(['2026-10-14'])
  })

  it('a stretch is on every day it covers, within the range', () => {
    expect(
      spanDays('2026-10-30', '2026-11-02', '2026-11-01', '2026-11-30'),
    ).toEqual(['2026-11-01', '2026-11-02'])
    expect(
      spanDays('2026-10-30', '2026-11-02', '2026-10-01', '2026-10-31'),
    ).toEqual(['2026-10-30', '2026-10-31'])
  })

  it('outside the range, nowhere', () => {
    expect(
      spanDays('2026-09-20', '2026-09-22', '2026-10-01', '2026-10-31'),
    ).toEqual([])
    expect(
      spanDays('2026-11-01', undefined, '2026-10-01', '2026-10-31'),
    ).toEqual([])
  })
})

describe('byDay', () => {
  it('puts each visit, due job and reminder under its days, in order', () => {
    const days = byDay({
      visits: [
        { id: 'late', start: 3, days: ['2026-10-14'] },
        { id: 'early', start: 1, days: ['2026-10-14', '2026-10-15'] },
      ],
      due: [{ id: 'job', dueDate: '2026-10-15' }],
      reminders: [{ id: 'call', date: '2026-10-20' }],
    })
    expect(days.get('2026-10-14')?.visits.map((visit) => visit.id)).toEqual([
      'early',
      'late',
    ])
    expect(days.get('2026-10-15')).toEqual({
      visits: [{ id: 'early', start: 1, days: ['2026-10-14', '2026-10-15'] }],
      due: [{ id: 'job', dueDate: '2026-10-15' }],
      reminders: [],
    })
    expect(days.get('2026-10-20')?.reminders).toHaveLength(1)
    expect(days.has('2026-10-16')).toBe(false)
  })
})
