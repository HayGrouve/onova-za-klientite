import { useSyncExternalStore } from 'react'

// Tailwind's `lg`: where the sidebar, the board and the dashboard start.
const WIDE = '(min-width: 64rem)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * True on a wide screen. Only for pages that show a different arrangement
 * there (board, dashboard); plain width changes stay in CSS (`lg:`).
 */
export function useWide() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}
