import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useEffect, useRef } from 'react'
import { usePageTitle } from '#/hooks/use-page-title'
import { m } from '#/paraglide/messages.js'

/**
 * A Settings section: a way back, a title, an optional line of help, the
 * content. A section that changes how the app looks also passes a `preview`
 * (`SettingsPreview`): above the controls on a phone, beside them, and kept in
 * view, on a wide screen.
 */
export function SettingsPage({
  title,
  help,
  preview,
  previewWideOnly = false,
  children,
}: {
  title: string
  help?: string
  preview?: React.ReactNode
  /** The section already shows its effect inline on a phone. */
  previewWideOnly?: boolean
  children: React.ReactNode
}) {
  usePageTitle(title)
  const page = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  // The pinned preview covers the top of the page on a phone, so a focused
  // control scrolls to just below it: its height goes into `--preview-h`.
  useEffect(() => {
    const element = strip.current
    const root = page.current
    if (!element || !root) return
    const measure = () =>
      root.style.setProperty('--preview-h', `${element.offsetHeight}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [preview])
  return (
    <div
      ref={page}
      className={cn(
        'flex flex-col gap-4 pb-8',
        preview
          ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-8'
          : 'lg:max-w-3xl',
      )}
    >
      <div className="flex flex-col gap-1 px-4 pt-1 lg:pt-3.5">
        <Link
          to="/settings"
          className="-ml-1 flex min-h-11 w-fit items-center gap-1 rounded-xl text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
        >
          <CaretLeftIcon className="size-4" />
          {m.settings_back()}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {help && <p className="text-sm text-muted-foreground">{help}</p>}
      </div>
      {preview && (
        // Pinned under the phone's header (none from lg) while the controls
        // scroll beneath, on the canvas so nothing shows through.
        <div
          ref={strip}
          className={cn(
            'sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 bg-canvas/95 px-4 pb-1 backdrop-blur lg:top-0 lg:pt-2 xl:top-6 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:bg-transparent xl:px-0 xl:pt-3.5 xl:backdrop-blur-none',
            previewWideOnly && 'max-xl:hidden',
          )}
        >
          {preview}
        </div>
      )}
      {preview ? (
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 max-xl:[&_:is(input,textarea,select,button,a)]:scroll-mt-(--preview-h)">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
