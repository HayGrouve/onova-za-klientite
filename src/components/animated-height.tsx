import { cn } from 'cn'
import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Grows and shrinks smoothly to fit what is inside, so a sheet changes height
 * between steps instead of jumping. The height is measured, not guessed; with
 * reduced motion it changes at once. A small inner margin keeps focus rings
 * from being cut off at the edges.
 */
export function AnimatedHeight({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const element = inner.current
    if (!element) return
    const measure = () => setHeight(element.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={cn(
        '-m-1 overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none',
        className,
      )}
      style={{ height }}
    >
      <div ref={inner} className="p-1">
        {children}
      </div>
    </div>
  )
}
