// Sorting a table by one column, and keeping the choice in the address so
// that Back returns to the same list. Pure, so it is tested without a browser.

/** The column a table is sorted by and which way, or null for its own order. */
export type Sort<TKey extends string> = { key: TKey; desc: boolean } | null

/**
 * What a click on a column heading does: sort by it, or turn the order round
 * when it is already the sort. Amounts start biggest first; words and dates
 * A to Z.
 */
export function nextSort<TKey extends string>(
  sort: Sort<TKey>,
  key: TKey,
  numeric: boolean,
): Sort<TKey> {
  return sort?.key === key ? { key, desc: !sort.desc } : { key, desc: numeric }
}

/** Rows in the order `sort` asks for, by one comparer per column. */
export function sortRows<T, TKey extends string>(
  rows: T[],
  sort: Sort<TKey>,
  compare: Record<TKey, (a: T, b: T) => number>,
) {
  if (!sort) return rows
  const by = compare[sort.key]
  return [...rows].sort((a, b) => (sort.desc ? by(b, a) : by(a, b)))
}

/** A sort as the address keeps it: `?sort=balance&order=desc`. */
export type SortSearch<TKey extends string> = {
  sort?: TKey
  order?: 'asc' | 'desc'
}

export function sortToSearch<TKey extends string>(
  sort: Sort<TKey>,
): SortSearch<TKey> {
  return sort ? { sort: sort.key, order: sort.desc ? 'desc' : 'asc' } : {}
}

export function sortFromSearch<TKey extends string>(
  search: SortSearch<TKey>,
): Sort<TKey> {
  return search.sort
    ? { key: search.sort, desc: search.order === 'desc' }
    : null
}

/** The sort part of an address, with anything unknown dropped (for `validateSearch`). */
export function parseSortSearch<TKey extends string>(
  search: Record<string, unknown>,
  keys: readonly TKey[],
): SortSearch<TKey> {
  const key = keys.find((item) => item === search.sort)
  if (!key) return {}
  return search.order === 'asc' || search.order === 'desc'
    ? { sort: key, order: search.order }
    : { sort: key }
}
