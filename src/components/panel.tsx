import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'

/**
 * One topic on a detail page: a white card with its heading inside. Space
 * between panels separates topics; lines inside a panel separate rows.
 */
export function Panel({
  title,
  icon: IconComponent,
  count,
  hint,
  action,
  footer,
  children,
  className,
}: {
  title: string
  icon?: Icon
  count?: number
  hint?: React.ReactNode
  action?: React.ReactNode
  /** Buttons that act on the whole topic, under a line at the bottom. */
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'mx-4 flex animate-rise flex-col overflow-hidden surface',
        className,
      )}
    >
      <div className="flex min-h-12 items-center justify-between gap-2 py-1.5 pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-2">
          {IconComponent && (
            <IconComponent
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground"
            />
          )}
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {count !== undefined && (
            <span className="rounded-full bg-foreground/7 px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
          {hint}
        </div>
        {action}
      </div>
      {children}
      {footer && (
        <div className="flex flex-wrap gap-2 border-t border-border/70 px-4 py-3">
          {footer}
        </div>
      )}
    </section>
  )
}

/** Rows inside a panel, under a line and divided by lines. Hidden when empty. */
export function PanelList({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'flex stagger flex-col divide-y divide-border/70 border-t border-border/70 empty:hidden',
        className,
      )}
      {...props}
    />
  )
}

/** Free content inside a panel, under a line. */
export function PanelBody({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-t border-border/70 p-4', className)}
      {...props}
    />
  )
}
