import { cn } from 'cn'
import { initials } from '#/lib/initials'

/** A round badge with a person's initials. Decorative: the name is shown next to it. */
export function InitialsAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground/70',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
