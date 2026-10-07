import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { boardColumn } from './board'
import type { BoardJob } from './board'

const job = (overrides: Partial<BoardJob> & { id: string }): BoardJob & {
  id: string
} => ({
  _creationTime: 0,
  stageGroup: 'new',
  owes: false,
  balanceCents: 0,
  ...overrides,
})

const ids = (jobs: Array<{ id: string }>) => jobs.map((item) => item.id)

describe('boardColumn', () => {
  it('open work: soonest due date first, then undated work, newest first', () => {
    const column = boardColumn('in_progress', [
      job({ id: 'undated-old', _creationTime: 1 }),
      job({ id: 'due-later', dueDate: '2026-10-20', _creationTime: 5 }),
      job({ id: 'undated-new', _creationTime: 9 }),
      job({ id: 'due-sooner', dueDate: '2026-10-09', _creationTime: 2 }),
    ])
    expect(ids(column.jobs)).toEqual([
      'due-sooner',
      'due-later',
      'undated-new',
      'undated-old',
    ])
  })

  it('done work: the most recently finished first', () => {
    const column = boardColumn('done', [
      job({ id: 'a', stageGroup: 'done', doneAt: 100, dueDate: '2026-01-01' }),
      job({ id: 'b', stageGroup: 'done', doneAt: 300 }),
      job({ id: 'c', stageGroup: 'done', doneAt: 200 }),
    ])
    expect(ids(column.jobs)).toEqual(['b', 'c', 'a'])
  })

  it('cancelled work: newest first', () => {
    const column = boardColumn('cancelled', [
      job({ id: 'old', stageGroup: 'cancelled', _creationTime: 1 }),
      job({ id: 'new', stageGroup: 'cancelled', _creationTime: 2 }),
    ])
    expect(ids(column.jobs)).toEqual(['new', 'old'])
  })

  it('a closed column shows only the latest, but counts and sums them all', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      job({
        id: String(index),
        stageGroup: 'done',
        doneAt: index,
        owes: index % 2 === 0,
        balanceCents: 100,
      }),
    )
    const column = boardColumn('done', many, 20)
    expect(column.jobs).toHaveLength(20)
    expect(column.jobs[0]?.id).toBe('29')
    expect(column.total).toBe(30)
    expect(column.owedCents).toBe(1500)
  })

  it('open columns are never cut short', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      job({ id: String(index) }),
    )
    expect(boardColumn('new', many, 20).jobs).toHaveLength(30)
  })

  it('the column total owed is the sum of balances that are still owed', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            owes: fc.boolean(),
            balanceCents: fc.integer({ min: 0, max: 10_000_000 }),
          }),
        ),
        (rows) => {
          const jobs = rows.map((row, index) =>
            job({ id: String(index), ...row }),
          )
          const expected = rows
            .filter((row) => row.owes)
            .reduce((sum, row) => sum + row.balanceCents, 0)
          expect(boardColumn('new', jobs).owedCents).toBe(expected)
        },
      ),
    )
  })
})
