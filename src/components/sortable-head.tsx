import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { TableHead } from '#/components/ui/table'
import type { Sort } from '../../shared/sort'

/** A table heading that sorts its column, with a caret for the direction. */
export function SortableHead<TKey extends string>({
  column,
  label,
  sort,
  onSort,
  numeric = false,
  className,
}: {
  column: TKey
  label: string
  sort: Sort<TKey>
  onSort: (key: TKey, numeric: boolean) => void
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
