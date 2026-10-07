import { useConvexConnectionState } from 'convex/react'
import { useEffect, useState } from 'react'

const DEBOUNCE_MS = 2500
const STUCK_RELOAD_MS = 15_000

/**
 * Offline from three signals (ADR 0010): the browser's online state, the
 * Convex websocket, and a short debounce so a phone waking up doesn't flash
 * a banner. If the browser is online but the websocket stays down for 15 s,
 * the page reloads (convex-js#181).
 */
export function useOffline() {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState()
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setBrowserOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const down = !browserOnline || (hasEverConnected && !isWebSocketConnected)
  useEffect(() => {
    if (!down) {
      setOffline(false)
      return
    }
    const id = window.setTimeout(() => setOffline(true), DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [down])

  useEffect(() => {
    if (!browserOnline || isWebSocketConnected || !hasEverConnected) return
    const id = window.setTimeout(
      () => window.location.reload(),
      STUCK_RELOAD_MS,
    )
    return () => window.clearTimeout(id)
  }, [browserOnline, isWebSocketConnected, hasEverConnected])

  return offline
}
