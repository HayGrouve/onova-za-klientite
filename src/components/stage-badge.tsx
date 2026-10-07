import { cn } from 'cn'
import type { StageColor } from '../../shared/stages'

const COLORS: Record<StageColor, string> = {
  gray: 'bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  violet:
    'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

export function StageBadge({
  name,
  color,
  className,
}: {
  name: string
  color: StageColor
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
        COLORS[color],
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current opacity-70"
      />
      {name}
    </span>
  )
}
