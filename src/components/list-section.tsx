import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'

// Icons stay quiet; red marks the one section that needs attention now.
type Tone = 'muted' | 'danger'

const TONE: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  danger: 'text-destructive',
}

/** The heading above a group: an icon, the title, a count, a hint and an action. */
export function SectionHeader({
  title,
  icon: IconComponent,
  tone = 'muted',
  count,
  hint,
  action,
}: {
  title: string
  icon?: Icon
  tone?: Tone
  count?: number
  hint?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 items-center gap-2">
        {IconComponent && (
          <IconComponent
            aria-hidden
            className={cn('size-5 shrink-0', TONE[tone])}
          />
        )}
        <h2 className="truncate text-sm font-semibold text-muted-foreground">
          {title}
        </h2>
        {count !== undefined && (
          <span className="rounded-full bg-foreground/7 px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        {hint}
      </div>
      {action}
    </div>
  )
}

/** Rows in one white card, divided by lines. Hidden when empty. */
export function ListCard({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'mx-4 flex flex-col divide-y divide-border/70 overflow-hidden surface empty:hidden',
        className,
      )}
      {...props}
    />
  )
}

/** A quiet line inside a list card when there is nothing to list. */
export function ListNote({ children }: { children: React.ReactNode }) {
  return <li className="px-4 py-3 text-sm text-muted-foreground">{children}</li>
}

export function ListSection({
  title,
  icon,
  tone,
  count,
  hint,
  action,
  footer,
  children,
}: {
  title: string
  icon?: Icon
  tone?: Tone
  count?: number
  hint?: React.ReactNode
  action?: React.ReactNode
  /** Shown under the card, such as the buttons that add to the list. */
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <SectionHeader
        title={title}
        icon={icon}
        tone={tone}
        count={count}
        hint={hint}
        action={action}
      />
      <ListCard>{children}</ListCard>
      {footer}
    </section>
  )
}
