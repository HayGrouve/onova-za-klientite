import { lazy, Suspense, useEffect, useState } from 'react'
import { CenteredMessage } from '#/components/centered-message'
import { Spinner } from '#/components/ui/spinner'
import { convexUrl } from '#/lib/env'
import { loadLastSnapshot } from '#/lib/offline-store'
import type { SavedSnapshot } from '#/lib/offline-store'

const OfflineApp = lazy(() =>
  import('./offline-app').then((module) => ({ default: module.OfflineApp })),
)

/** How long the signed-in app may take to start before the saved copy shows. */
export const STARTING_UP_MS = 8000

/** While the saved copy shows, how often to check whether the server is back. */
export const PROBE_MS = 10_000

/**
 * The spinner while the signed-in app starts (Clerk, then Convex). A phone can
 * report being online with no way out (a weak signal, Wi-Fi without internet),
 * and then Clerk never loads: the cold-start check on the browser's online
 * state doesn't see it. After `STARTING_UP_MS` the last saved copy is shown
 * read-only instead, and the page reloads as soon as the server answers
 * again (no `online` event comes, the browser never thought it was offline).
 */
export function StartingUp() {
  const [slow, setSlow] = useState(false)
  const [saved, setSaved] = useState<SavedSnapshot | null | undefined>(
    undefined,
  )

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), STARTING_UP_MS)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!slow) return
    let cancelled = false
    void loadLastSnapshot().then((copy) => !cancelled && setSaved(copy))
    return () => {
      cancelled = true
    }
  }, [slow])

  const showing = saved !== undefined
  useEffect(() => {
    if (!showing || !convexUrl) return
    const id = window.setInterval(() => {
      // An opaque answer is enough: it only has to get through.
      fetch(`${convexUrl}/version`, {
        mode: 'no-cors',
        cache: 'no-store',
      }).then(
        () => window.location.reload(),
        () => undefined,
      )
    }, PROBE_MS)
    return () => window.clearInterval(id)
  }, [showing])

  if (saved === undefined) {
    return (
      <CenteredMessage>
        <Spinner className="size-6 text-muted-foreground" />
      </CenteredMessage>
    )
  }
  return (
    <Suspense fallback={null}>
      <OfflineApp saved={saved} />
    </Suspense>
  )
}
