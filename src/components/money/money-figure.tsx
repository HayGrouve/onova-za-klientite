import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { Hint } from '#/components/hint'
import { formatMoney } from '../../../shared/money'

// Amounts are calm facts in ink, large and light (D115). Colour only where it
// warns: a loss. What is owed and a profit stay ink, so nothing shouts.
const EMPHASIS = {
  primary: 'font-normal',
  positive: '',
  negative: 'text-destructive',
}

/**
 * One amount: the label, the amount under it, and an "i" in the corner that
 * explains the term. No card of its own: a card holds several figures, split
 * by lines. The hint comes last in the markup, so the amount stays the label's
 * next sibling.
 */
export function MoneyFigure({
  label,
  cents,
  hint,
  icon: IconComponent,
  emphasis,
  size = 'md',
}: {
  label: string
  cents: number
  hint: string
  icon?: Icon
  emphasis?: keyof typeof EMPHASIS
  /** `sm` fits three to a row. */
  size?: 'sm' | 'md'
}) {
  const small = size === 'sm'
  return (
    <div className={cn('relative flex flex-col gap-1', small ? 'p-3' : 'p-4')}>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 leading-tight text-muted-foreground',
          small ? 'pr-6 text-xs' : 'pr-7 text-sm',
        )}
      >
        {IconComponent && (
          <IconComponent aria-hidden className="size-4 shrink-0" />
        )}
        {label}
      </span>
      <div
        className={cn(
          'tracking-[-0.01em] tabular-nums',
          small ? 'text-lg font-medium' : 'text-[2rem] leading-tight font-light',
          emphasis && EMPHASIS[emphasis],
        )}
      >
        {formatMoney(cents)}
      </div>
      <Hint
        term={label}
        className={cn('absolute', small ? 'top-2 right-2' : 'top-3 right-3')}
      >
        {hint}
      </Hint>
    </div>
  )
}
