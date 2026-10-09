import { lazy, Suspense, useEffect, useState } from 'react'
import { CenteredMessage } from '#/components/centered-message'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { convexUrl } from '#/lib/env'
import { loadLastSnapshot } from '#/lib/offline-store'
import type { SavedSnapshot } from '#/lib/offline-store'
import { m } from '#/paraglide/messages.js'

const OfflineApp = lazy(() =>
  import('./offline-app').then((module) => ({ default: module.OfflineApp })),
)

/** How long the signed-in app may take to start before the saved copy shows. */
export const STARTING_UP_MS = 8000

/** While the saved copy shows, how often to check whether the server is back. */
export const PROBE_MS = 10_000

/**
 * Once the server answers, how long the real start gets to finish before the
 * page is reloaded. On a slow but working link it often does, and then this
 * unmounts and nothing reloads.
 */
export const RELOAD_GRACE_MS = 5000

/**
 * The page reloads by itself at most once in this time. A link that answers
 * but is too slow to start the app would otherwise reload again and again.
 */
export const RELOAD_COOLDOWN_MS = 120_000

const RELOAD_STAMP = 'onova.startingUp.reloadedAt'

function reloadedRecently() {
  try {
    const stamp = Number(sessionStorage.getItem(RELOAD_STAMP))
    return Number.isFinite(stamp) && Date.now() - stamp < RELOAD_COOLDOWN_MS
  } catch {
    // No way to remember a reload: leave the next one to the reader.
    return true
  }
}

function reloadNow() {
  try {
    sessionStorage.setItem(RELOAD_STAMP, String(Date.now()))
  } catch {
    // Nothing to guard with; the reload is the reader's own choice.
  }
  window.location.reload()
}

/**
 * When this page load first waited on the app. `StartingUp` shows at three
 * steps of the layout (Clerk, the profile, the viewer) and each is a new
 * mount, so the wait is measured from the first of them.
 */
let startedAt: number | undefined

/** Forget when this page load began waiting: the next start waits afresh. */
export function restartStartingUpClock() {
  startedAt = undefined
}

/**
 * Rendered once the signed-in app is up: a later start in the same page load
 * (signed out and in again, a lost profile) waits the whole time again rather
 * than showing the saved copy at once, which may be another account's.
 */
export function StartedUp() {
  useEffect(() => restartStartingUpClock(), [])
  return null
}

/**
 * The spinner while the signed-in app starts (Clerk, then Convex). A phone can
 * report being online with no way out (a weak signal, Wi-Fi without internet),
 * and then Clerk never loads: the cold-start check on the browser's online
 * state doesn't see it. After `STARTING_UP_MS` the last saved copy is shown
 * read-only instead. Once the server answers again (no `online` event comes,
 * the browser never thought it was offline) the real start gets
 * `RELOAD_GRACE_MS` to finish, then the page reloads, once per
 * `RELOAD_COOLDOWN_MS`; after that the reader is offered the reload instead.
 */
export function StartingUp() {
  const [slow, setSlow] = useState(false)
  const [saved, setSaved] = useState<SavedSnapshot | null | undefined>(
    undefined,
  )
  // Once the server answers: reload after the grace, or, having just reloaded,
  // offer the reload to the reader.
  const [reached, setReached] = useState<'no' | 'wait' | 'offer'>('no')

  useEffect(() => {
    startedAt ??= Date.now()
    const left = Math.max(0, STARTING_UP_MS - (Date.now() - startedAt))
    const id = window.setTimeout(() => setSlow(true), left)
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
    if (!showing || !convexUrl || reached !== 'no') return
    let cancelled = false
    const id = window.setInterval(() => {
      // An opaque answer is enough: it only has to get through.
      fetch(`${convexUrl}/version`, {
        mode: 'no-cors',
        cache: 'no-store',
      }).then(
        () => {
          if (!cancelled) setReached(reloadedRecently() ? 'offer' : 'wait')
        },
        () => undefined,
      )
    }, PROBE_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [showing, reached])

  useEffect(() => {
    if (reached !== 'wait') return
    const id = window.setTimeout(reloadNow, RELOAD_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [reached])

  if (saved === undefined) {
    return (
      <CenteredMessage>
        <Spinner
          aria-label={m.loading()}
          className="size-6 text-muted-foreground"
        />
      </CenteredMessage>
    )
  }
  return (
    <>
      {reached === 'offer' && (
        <div
          role="status"
          className="sticky top-0 z-20 mx-auto flex w-full max-w-lg items-center justify-between gap-3 border-b bg-background px-4 py-2"
        >
          <span>{m.offline_connection_back()}</span>
          <Button size="xl" onClick={reloadNow}>
            {m.offline_reload()}
          </Button>
        </div>
      )}
      <Suspense fallback={null}>
        <OfflineApp saved={saved} />
      </Suspense>
    </>
  )
}
