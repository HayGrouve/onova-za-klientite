import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { m } from '#/paraglide/messages.js'

const OPEN_KEY = 'settings-preview-open'

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

/**
 * What a Settings section changes, drawn live from the values on screen, as
 * setup's Job form is. A wide screen keeps it beside the controls. A phone
 * pins a short strip of it above them, as setup does, and lets it fold away.
 */
export function SettingsPreview({
  title,
  scrollTo,
  fit = false,
  children,
}: {
  /** The line above the card, when the default one fits poorly. */
  title?: string
  /** A part to bring into view in the phone's short strip, and when. */
  scrollTo?: { selector: string; key: unknown }
  /** Shows the whole card on a phone too, with no strip that scrolls inside. */
  fit?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() => readOpen())
  const body = useRef<HTMLDivElement>(null)
  const toggle = () => {
    try {
      localStorage.setItem(OPEN_KEY, String(!open))
    } catch {
      // Storage can be off (private mode): the strip just forgets next time.
    }
    setOpen(!open)
  }

  const selector = scrollTo?.selector
  const scrollKey = JSON.stringify(scrollTo?.key)
  useEffect(() => {
    const target = selector && body.current?.querySelector(selector)
    if (target instanceof HTMLElement) bringIntoView(target)
  }, [selector, scrollKey])

  return (
    <aside aria-label={m.settings_preview_label()} className="flex flex-col">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-2 xl:min-h-8">
        <p className="text-sm text-muted-foreground">
          {title ?? m.settings_preview_title()}
        </p>
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="-mr-2 min-h-11 rounded-lg px-2 text-sm font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 xl:hidden"
        >
          {open ? m.settings_preview_hide() : m.settings_preview_show()}
        </button>
      </div>
      <div
        ref={body}
        data-preview-body
        className={cn(
          'rounded-2xl border bg-card p-4 shadow-sm shadow-zinc-900/5',
          // The phone's strip stays short and scrolls inside, unless it fits.
          !fit &&
            'max-xl:max-h-[32dvh] max-xl:overflow-y-auto max-xl:overscroll-contain',
          !open && 'max-xl:hidden',
        )}
      >
        {children}
      </div>
    </aside>
  )
}

/** Scrolls the preview's own strip, never the page, to show `target`. */
function bringIntoView(target: HTMLElement) {
  const container = target.closest<HTMLElement>('[data-preview-body]')
  if (!container || container.scrollHeight <= container.clientHeight) return
  const offset =
    target.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  container.scrollTo({
    top: Math.max(0, offset - 16),
    behavior: reduce ? 'auto' : 'smooth',
  })
}

/**
 * Flashes its content each time `watch` changes after the first render, the
 * way setup's preview marks what an answer just changed, and brings it into
 * view in the phone's strip.
 */
export function Flash({
  watch,
  className,
  children,
}: {
  watch: unknown
  className?: string
  children: React.ReactNode
}) {
  const key = JSON.stringify(watch)
  const [seen, setSeen] = useState(key)
  const [count, setCount] = useState(0)
  const element = useRef<HTMLDivElement>(null)
  if (key !== seen) {
    setSeen(key)
    setCount(count + 1)
  }
  useEffect(() => {
    if (count > 0 && element.current) bringIntoView(element.current)
  }, [count])
  return (
    <div
      ref={element}
      // Re-keying restarts the animation when the same part changes again.
      key={count}
      className={cn(
        '-mx-2 rounded-xl px-2',
        count > 0 && 'motion-safe:animate-[flash_1.4s_ease-out]',
        className,
      )}
    >
      {children}
    </div>
  )
}
