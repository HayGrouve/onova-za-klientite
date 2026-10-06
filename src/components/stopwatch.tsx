import { TimerIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { formatDuration, isTimingOn } from '#/lib/timing'
import { m } from '#/paraglide/messages.js'

/** Shown only with the `?timing` flag on (Q15). `stoppedAt` freezes it. */
export function Stopwatch({
  startedAt,
  stoppedAt,
}: {
  startedAt: number
  stoppedAt?: number
}) {
  const [now, setNow] = useState(() => Date.now())
  const [on] = useState(isTimingOn)
  useEffect(() => {
    if (!on || stoppedAt !== undefined) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [on, stoppedAt])
  if (!on) return null
  const time = formatDuration((stoppedAt ?? now) - startedAt)
  return (
    <span
      className="fixed top-[calc(0.5rem+env(safe-area-inset-top))] right-3 z-50 flex items-center gap-1 rounded-full bg-foreground/85 px-2.5 py-1 text-xs font-medium text-background tabular-nums"
      aria-label={m.timing_stopwatch({ time })}
    >
      <TimerIcon className="size-3.5" />
      {time}
    </span>
  )
}
