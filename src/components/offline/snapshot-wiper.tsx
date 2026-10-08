import { useAuth } from '@clerk/tanstack-react-start'
import { useEffect } from 'react'
import { wipeSnapshots } from '#/lib/offline-store'

/**
 * Whoever is no longer signed in leaves nothing on the phone. Signing out from
 * the app wipes at once; this covers a session that ended elsewhere (expired,
 * revoked). Only online: offline, Clerk can't say who is signed in, and the
 * snapshot is exactly what the offline view needs.
 */
export function SnapshotWiper() {
  const { isLoaded, isSignedIn } = useAuth()
  useEffect(() => {
    if (isLoaded && !isSignedIn && navigator.onLine) void wipeSnapshots()
  }, [isLoaded, isSignedIn])
  return null
}
