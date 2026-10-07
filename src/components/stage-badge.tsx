import { cn } from 'cn'
import type { StageGroup } from '../../shared/stages'

// Colour carries meaning only: work still open is blue, done is green,
// cancelled is red. The stage's own name says the rest (D53).
const GROUP_STYLE: Record<StageGroup, string> = {
  new: 'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-900',
  in_progress:
    'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-900',
  done: 'bg-green-50 text-green-800 ring-green-200 dark:bg-green-950 dark:text-green-200 dark:ring-green-900',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900',
}

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
        'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        GROUP_STYLE[group],
        className,
      )}
    >
      {name}
    </span>
  )
}
