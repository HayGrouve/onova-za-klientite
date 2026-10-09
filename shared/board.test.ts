import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  boardColumn,
  filterFromSearch,
  filterJobs,
  filterToSearch,
  isFiltering,
  owedCents,
  unshownJobs,
  parseFilterSearch,
} from './board'
import type { BoardJob, FilterableJob } from './board'

const job = (
  overrides: Partial<BoardJob> & { id: string },
): BoardJob & {
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

const filterable = (
  overrides: Partial<FilterableJob> & { id: string },
): FilterableJob & { id: string } => ({
  title: 'Работа',
  clientName: 'Иван Петров',
  isNoClient: false,
  stageName: 'Нова',
  owes: false,
  balanceCents: 0,
  ...overrides,
})

describe('filterJobs', () => {
  const TODAY = '2026-10-08'

  it('no filter keeps every job, in order', () => {
    const jobs = [filterable({ id: 'a' }), filterable({ id: 'b' })]
    expect(filterJobs(jobs, {}, TODAY)).toEqual(jobs)
    expect(filterJobs(jobs, { text: '   ' }, TODAY)).toEqual(jobs)
    expect(isFiltering({})).toBe(false)
    expect(isFiltering({ text: ' ' })).toBe(false)
    expect(isFiltering({ owing: true })).toBe(true)
    expect(isFiltering({ dueThisMonth: true })).toBe(true)
    expect(isFiltering({ text: 'шкаф' })).toBe(true)
  })

  it('the text matches the title, the client and the stage name', () => {
    const jobs = [
      filterable({ id: 'title', title: 'Шкафчета за кухня' }),
      filterable({ id: 'client', clientName: 'Мария Колева' }),
      filterable({ id: 'stage', stageName: 'Чака материали' }),
      filterable({ id: 'none' }),
    ]
    const found = (text: string) =>
      filterJobs(jobs, { text }, TODAY).map((item) => item.id)
    expect(found('шкаф')).toEqual(['title'])
    expect(found('колева')).toEqual(['client'])
    expect(found('чака')).toEqual(['stage'])
    expect(found('mar kol')).toEqual(['client'])
  })

  it('a job with no client does not match on its placeholder name', () => {
    const jobs = [
      filterable({ id: 'x', isNoClient: true, clientName: 'Без клиент' }),
    ]
    expect(filterJobs(jobs, { text: 'клиент' }, TODAY)).toEqual([])
  })

  it('"owing" keeps the jobs that still owe a balance', () => {
    const jobs = [
      filterable({ id: 'owes', owes: true, balanceCents: 5000 }),
      filterable({ id: 'paid', owes: false, balanceCents: 0 }),
      filterable({ id: 'zero', owes: true, balanceCents: 0 }),
    ]
    expect(
      filterJobs(jobs, { owing: true }, TODAY).map((item) => item.id),
    ).toEqual(['owes'])
  })

  it('"due this month" uses the Sofia month of today, not a rolling window', () => {
    const jobs = [
      filterable({ id: 'first', dueDate: '2026-10-01' }),
      filterable({ id: 'last', dueDate: '2026-10-31' }),
      filterable({ id: 'earlier', dueDate: '2026-09-30' }),
      filterable({ id: 'later', dueDate: '2026-11-01' }),
      filterable({ id: 'other-year', dueDate: '2025-10-15' }),
      filterable({ id: 'undated' }),
    ]
    expect(
      filterJobs(jobs, { dueThisMonth: true }, TODAY).map((item) => item.id),
    ).toEqual(['first', 'last'])
    expect(
      filterJobs(jobs, { dueThisMonth: true }, '2026-12-31').map(
        (item) => item.id,
      ),
    ).toEqual([])
  })

  it('the text and both chips all have to hold', () => {
    const jobs = [
      filterable({
        id: 'all',
        title: 'Врата',
        owes: true,
        balanceCents: 100,
        dueDate: '2026-10-20',
      }),
      filterable({ id: 'no-owe', title: 'Врата', dueDate: '2026-10-20' }),
      filterable({
        id: 'no-due',
        title: 'Врата',
        owes: true,
        balanceCents: 100,
      }),
      filterable({
        id: 'no-text',
        owes: true,
        balanceCents: 100,
        dueDate: '2026-10-20',
      }),
    ]
    expect(
      filterJobs(
        jobs,
        { text: 'врата', owing: true, dueThisMonth: true },
        TODAY,
      ).map((item) => item.id),
    ).toEqual(['all'])
  })

  it('only ever returns jobs it was given, in their order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            owes: fc.boolean(),
            balanceCents: fc.integer({ min: 0, max: 100_000 }),
            dueDate: fc.option(
              fc.constantFrom('2026-09-30', '2026-10-15', '2026-11-02'),
              { nil: undefined },
            ),
          }),
        ),
        fc.boolean(),
        fc.boolean(),
        (rows, owing, dueThisMonth) => {
          const jobs = rows.map((row, index) =>
            filterable({ id: String(index), ...row }),
          )
          const kept = filterJobs(jobs, { owing, dueThisMonth }, TODAY)
          expect(kept.every((item) => jobs.includes(item))).toBe(true)
          const positions = kept.map((item) => jobs.indexOf(item))
          expect(positions).toEqual([...positions].sort((a, b) => a - b))
        },
      ),
    )
  })
})

describe('owedCents', () => {
  it('adds up the balances that are still owed, so a column total follows its visible cards', () => {
    const cards = [
      { owes: true, balanceCents: 5700 },
      { owes: false, balanceCents: 900 },
      { owes: true, balanceCents: 300 },
    ]
    expect(owedCents(cards)).toBe(6000)
    expect(owedCents(cards.slice(1))).toBe(300)
    expect(owedCents([])).toBe(0)
  })
})

describe('the filter in the address', () => {
  it('reads only what it knows, and words even when they look like a number', () => {
    expect(
      parseFilterSearch({ q: 12, owing: true, due: 'month', view: 'table' }),
    ).toEqual({ q: '12', owing: true, due: 'month' })
    expect(parseFilterSearch({ q: '  ', owing: 'yes', due: 'week' })).toEqual(
      {},
    )
  })

  it('goes to the address and back unchanged', () => {
    for (const filter of [
      {},
      { text: 'гардероб', owing: true, dueThisMonth: true },
      { owing: true },
    ]) {
      const search = filterToSearch(filter)
      expect(parseFilterSearch(search)).toEqual(search)
      expect(isFiltering(filterFromSearch(search))).toBe(isFiltering(filter))
    }
  })
})

describe('unshownJobs', () => {
  const counts = { new: 812, in_progress: 3, done: 0, cancelled: 40 }

  it('is the total when a tab has more jobs than rows', () => {
    expect(unshownJobs(500, counts, 'new')).toEqual({ shown: 500, total: 812 })
  })

  it('is nothing when every job of the tab is shown', () => {
    expect(unshownJobs(3, counts, 'in_progress')).toBeNull()
    expect(unshownJobs(0, counts, 'done')).toBeNull()
  })

  it('counts every group for "all", and when a filter reads every tab', () => {
    expect(unshownJobs(500, counts, 'all')).toEqual({ shown: 500, total: 855 })
    expect(unshownJobs(855, counts, 'all')).toBeNull()
  })
})
