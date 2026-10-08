import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'

/**
 * Around a table that can still scroll sideways: the edge with more to see
 * fades out, so a cut-off column is never a surprise. It watches the
 * scrolling container that `Table` renders, and shows nothing when the table
 * fits.
 */
export function ScrollFade({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const scroller = ref.current?.querySelector<HTMLElement>(
      '[data-slot="table-container"]',
    )
    if (!scroller) return
    const update = () => {
      const room = scroller.scrollWidth - scroller.clientWidth
      const start = scroller.scrollLeft > 1
      const end = scroller.scrollLeft < room - 1
      setEdges((last) =>
        last.start === start && last.end === end ? last : { start, end },
      )
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    // The container changes width with the window, and the table inside it
    // with its rows and columns.
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    return () => {
      scroller.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const fade =
    'pointer-events-none absolute inset-y-0 z-10 w-10 from-card to-transparent transition-opacity duration-200'
  return (
    <div ref={ref} className={cn('relative', className)}>
      {children}
      <div
        aria-hidden
        className={cn(
          fade,
          'left-0 bg-linear-to-r',
          edges.start ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          fade,
          'right-0 bg-linear-to-l',
          edges.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
