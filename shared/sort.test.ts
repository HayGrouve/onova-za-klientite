import { describe, expect, it } from 'vitest'
import {
  nextSort,
  parseSortSearch,
  sortFromSearch,
  sortRows,
  sortToSearch,
} from './sort'
import type { Sort } from './sort'

type Key = 'name' | 'amount'
type Row = { name: string; amount: number }
const KEYS = ['name', 'amount'] as const
const BY: Record<Key, (a: Row, b: Row) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  amount: (a, b) => a.amount - b.amount,
}
const rows: Row[] = [
  { name: 'b', amount: 2 },
  { name: 'c', amount: 3 },
  { name: 'a', amount: 1 },
]

describe('nextSort', () => {
  it('words start A to Z and amounts start biggest first', () => {
    expect(nextSort<Key>(null, 'name', false)).toEqual({
      key: 'name',
      desc: false,
    })
    expect(nextSort<Key>(null, 'amount', true)).toEqual({
      key: 'amount',
      desc: true,
    })
  })

  it('the same column again turns the order round; another column starts over', () => {
    const first: Sort<Key> = { key: 'name', desc: false }
    expect(nextSort(first, 'name', false)).toEqual({ key: 'name', desc: true })
    expect(nextSort({ key: 'name', desc: true }, 'name', false)).toEqual(first)
    expect(nextSort(first, 'amount', true)).toEqual({
      key: 'amount',
      desc: true,
    })
  })
})

describe('sortRows', () => {
  it('keeps the order it was given when nothing is chosen', () => {
    expect(sortRows(rows, null, BY)).toBe(rows)
  })

  it('sorts a copy, either way round', () => {
    const asc = sortRows(rows, { key: 'amount', desc: false }, BY)
    expect(asc.map((row) => row.name)).toEqual(['a', 'b', 'c'])
    const desc = sortRows(rows, { key: 'name', desc: true }, BY)
    expect(desc.map((row) => row.name)).toEqual(['c', 'b', 'a'])
    expect(rows.map((row) => row.name)).toEqual(['b', 'c', 'a'])
  })
})

describe('the sort in the address', () => {
  it('writes and reads back both the column and the direction', () => {
    const sorts: Array<Sort<Key>> = [
      null,
      { key: 'name', desc: false },
      { key: 'amount', desc: true },
    ]
    for (const sort of sorts) {
      expect(sortFromSearch(sortToSearch(sort))).toEqual(sort)
    }
    expect(sortToSearch<Key>(null)).toEqual({})
  })

  it('keeps only a known column and a known direction', () => {
    expect(parseSortSearch({ sort: 'amount', order: 'desc' }, KEYS)).toEqual({
      sort: 'amount',
      order: 'desc',
    })
    expect(parseSortSearch({ sort: 'amount' }, KEYS)).toEqual({
      sort: 'amount',
    })
    expect(parseSortSearch({ sort: 'nope', order: 'desc' }, KEYS)).toEqual({})
    expect(parseSortSearch({ sort: 'name', order: 'sideways' }, KEYS)).toEqual({
      sort: 'name',
    })
    expect(parseSortSearch({ order: 'asc' }, KEYS)).toEqual({})
  })

  it('a column without a direction reads as A to Z', () => {
    expect(sortFromSearch<Key>({ sort: 'name' })).toEqual({
      key: 'name',
      desc: false,
    })
  })
})
