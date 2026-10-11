import { cn } from 'cn'
import type { StageGroup } from '../../shared/stages'

// Colour carries meaning only, and only in the dot: work still open is blue,
// done is green, cancelled is red. The stage's own name says the rest (D53).
// The name stays in quiet text, so a list of stages never shouts (D115).
export const GROUP_DOT: Record<StageGroup, string> = {
  new: 'bg-[oklch(0.6_0.06_245)]',
  in_progress: 'bg-[oklch(0.6_0.06_245)]',
  done: 'bg-[oklch(0.6_0.09_158)]',
  cancelled: 'bg-destructive',
}

/** A Stage as a coloured dot and its name. */
export function StageBadge({
  name,
  group,
  className,
}: {
  name: string
  group: StageGroup
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-0 shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full', GROUP_DOT[group])}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}
