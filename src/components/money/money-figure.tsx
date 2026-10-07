import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { Hint } from '#/components/hint'
import { formatMoney } from '../../../shared/money'

const TONE = {
  plain: 'surface',
  highlight: 'rounded-2xl bg-primary/8 ring-1 ring-primary/25',
  strong:
    'rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25',
}

/**
 * One amount on a card: the label, the amount under it, and an "i" in the
 * corner that explains the term. The hint comes last in the markup, so the
 * amount stays the label's next sibling.
 */
export function MoneyFigure({
  label,
  cents,
  hint,
  icon: IconComponent,
  tone = 'plain',
  size = 'md',
}: {
  label: string
  cents: number
  hint: string
  icon?: Icon
  tone?: keyof typeof TONE
  /** `sm` fits three to a row. */
  size?: 'sm' | 'md'
}) {
  const strong = tone === 'strong'
  const small = size === 'sm'
  return (
    <div
      className={cn(
        'relative flex h-full flex-col',
        small ? 'gap-1 p-3' : 'gap-2 p-3.5',
        TONE[tone],
      )}
    >
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 leading-tight',
          small ? 'pr-6 text-xs' : 'pr-7 text-sm',
          strong ? 'text-primary-foreground/85' : 'text-muted-foreground',
        )}
      >
        {IconComponent && (
          <span
            aria-hidden
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg',
              strong
                ? 'bg-primary-foreground/15 text-primary-foreground'
                : 'bg-primary/10 text-primary',
            )}
          >
            <IconComponent className="size-4" weight="bold" />
          </span>
        )}
        {label}
      </span>
      <div
        className={cn(
          'font-semibold tracking-tight tabular-nums',
          small ? 'text-lg' : 'text-2xl',
          tone === 'highlight' && 'text-primary',
        )}
      >
        {formatMoney(cents)}
      </div>
      <Hint
        term={label}
        className={cn(
          'absolute',
          small ? 'top-2 right-2' : 'right-3',
          !small && (IconComponent ? 'top-4' : 'top-3'),
          strong &&
            'text-primary-foreground/70 hover:text-primary-foreground data-popup-open:text-primary-foreground',
        )}
      >
        {hint}
      </Hint>
    </div>
  )
}
