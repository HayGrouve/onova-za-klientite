import { useAuth } from '@clerk/tanstack-react-start'
import { useConvex } from 'convex/react'
import { useEffect, useRef } from 'react'
import { api } from '../../../convex/_generated/api'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { persistStorage, saveSnapshot } from '#/lib/offline-store'

/** How long a visible app waits before taking the next snapshot. */
const REFRESH_MS = 5 * 60_000
/** The first snapshot waits, so it doesn't compete with the screen loading. */
const FIRST_DELAY_MS = 3000
/** Leaving the app saves, unless a snapshot was taken this recently. */
const HIDDEN_GAP_MS = 60_000

/**
 * Keeps the IndexedDB copy fresh while online. The snapshot is read once, not
 * subscribed to: it reads thousands of rows, and a live query would rerun it
 * on every change to the business. It is taken after the app is idle, when the
 * app is hidden, when the connection returns, and every few minutes while open.
 */
export function SnapshotKeeper() {
  const convex = useConvex()
  const { business } = useViewer()
  const { userId } = useAuth()
  const today = useToday()
  const businessId = business._id
  const lastAt = useRef(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    let busy = false
    const take = async (minGapMs = 0) => {
      if (busy || !navigator.onLine) return
      if (Date.now() - lastAt.current < minGapMs) return
      busy = true
      try {
        const data = await convex.query(api.offline.snapshot, {
          businessId,
          today,
        })
        if (cancelled) return
        lastAt.current = Date.now()
        await saveSnapshot(userId, data)
        await persistStorage()
      } catch {
        // Offline, signed out or a failed read: the last copy stays.
      } finally {
        busy = false
      }
    }

    const firstRun = window.setTimeout(() => void take(), FIRST_DELAY_MS)
    const onVisibility = () => {
      // Leaving the app is the moment to save what is on screen.
      if (document.visibilityState === 'hidden') void take(HIDDEN_GAP_MS)
    }
    const onOnline = () => void take()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void take(REFRESH_MS / 2)
    }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.clearTimeout(firstRun)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [convex, businessId, today, userId])
  return null
}
