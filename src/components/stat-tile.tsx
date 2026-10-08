import type { Icon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { cn } from 'cn'

// Red only for work that needs attention now, as in section headings (D52).
const TONE = {
  muted: { icon: 'bg-foreground/6 text-muted-foreground', value: '' },
  primary: { icon: 'bg-primary/10 text-primary', value: 'text-primary' },
  danger: {
    icon: 'bg-destructive/10 text-destructive',
    value: 'text-destructive',
  },
}

/**
 * One headline figure above a list, such as on Today: an icon, a label and a value, opening
 * the place that explains it. A row of these sits above the lists. Below xl
 * the tile is compact (no icon, a smaller value), so four fit in one row.
 */
export function StatTile({
  label,
  value,
  detail,
  icon: IconComponent,
  tone = 'muted',
  to,
  hash,
}: {
  label: string
  value: string
  /** A quiet line under the value. */
  detail?: string
  icon: Icon
  tone?: keyof typeof TONE
  to: LinkProps['to']
  hash?: string
}) {
  return (
    <Link
      to={to}
      hash={hash}
      className="group flex min-w-0 animate-rise items-start gap-3 surface p-3 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 xl:p-4"
    >
      <span
        aria-hidden
        className={cn(
          'hidden size-10 shrink-0 items-center justify-center rounded-xl xl:flex',
          TONE[tone].icon,
        )}
      >
        <IconComponent className="size-5" weight="duotone" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'text-xl leading-tight font-semibold tracking-tight break-words tabular-nums xl:text-2xl',
            TONE[tone].value,
          )}
        >
          {value}
        </span>
        {detail && (
          <span className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
    </Link>
  )
}
