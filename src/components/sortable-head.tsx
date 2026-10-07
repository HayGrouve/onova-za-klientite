import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { useState } from 'react'
import { TableHead } from '#/components/ui/table'

export type Sort<K extends string> = { key: K; desc: boolean } | null

/**
 * Which column a table is sorted by. Clicking a column sorts by it, clicking
 * again turns it round. Amounts start biggest first; words and dates A to Z.
 */
export function useSort<K extends string>() {
  const [sort, setSort] = useState<Sort<K>>(null)
  const toggle = (key: K, numeric: boolean) =>
    setSort(
      sort?.key === key ? { key, desc: !sort.desc } : { key, desc: numeric },
    )
  return [sort, toggle] as const
}

/** Rows in the order `sort` asks for, by one comparer per column. */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  compare: Record<K, (a: T, b: T) => number>,
) {
  if (!sort) return rows
  const by = compare[sort.key]
  return [...rows].sort((a, b) => (sort.desc ? by(b, a) : by(a, b)))
}

/** A table heading that sorts its column, with a caret for the direction. */
export function SortableHead<K extends string>({
  column,
  label,
  sort,
  onSort,
  numeric = false,
  className,
}: {
  column: K
  label: string
  sort: Sort<K>
  onSort: (key: K, numeric: boolean) => void
  numeric?: boolean
  className?: string
}) {
  const active = sort?.key === column
  const Caret = active && sort.desc ? CaretDownIcon : CaretUpIcon
  return (
    <TableHead
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      className={cn('h-11 px-2', numeric && 'text-right', className)}
    >
      <button
        type="button"
        onClick={() => onSort(column, numeric)}
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded-md px-2 font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
          // Amounts line up on the right, so their caret goes in front.
          numeric && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        <Caret
          aria-hidden
          className={cn('size-3.5', !active && 'opacity-0')}
          weight="bold"
        />
      </button>
    </TableHead>
  )
}
