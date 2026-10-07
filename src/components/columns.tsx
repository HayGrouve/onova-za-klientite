import { cn } from 'cn'
import { Fragment } from 'react'
import { useWide } from '#/hooks/use-wide'

/** One block of a page; `side` puts it in the second column on a wide screen. */
export type Slot = { key: string; node: React.ReactNode; side?: boolean }

const GRID = {
  // The work wide on the left, dates and history in a rail on the right.
  'main-side': 'grid-cols-[minmax(0,1fr)_minmax(0,26rem)]',
  // Who or what it is in a rail on the left, the activity on the right.
  'side-main': 'grid-cols-[minmax(0,24rem)_minmax(0,1fr)]',
  halves: 'grid-cols-2',
}

/**
 * A page's blocks in one column on a phone, in the order given, and in two
 * columns on a wide screen. The markup follows what is seen either way, so
 * keyboard and screen reader order match the screen.
 */
export function Columns({
  slots,
  layout,
  className,
}: {
  slots: Slot[]
  layout: keyof typeof GRID
  className?: string
}) {
  const wide = useWide()
  if (!wide) {
    return (
      <>
        {slots.map((slot) => (
          <Fragment key={slot.key}>{slot.node}</Fragment>
        ))}
      </>
    )
  }
  const column = (side: boolean) => (
    <div className="flex min-w-0 flex-col gap-4">
      {slots
        .filter((slot) => Boolean(slot.side) === side)
        .map((slot) => (
          <Fragment key={slot.key}>{slot.node}</Fragment>
        ))}
    </div>
  )
  return (
    <div className={cn('grid items-start', GRID[layout], className)}>
      {layout === 'side-main' ? column(true) : column(false)}
      {layout === 'side-main' ? column(false) : column(true)}
    </div>
  )
}
