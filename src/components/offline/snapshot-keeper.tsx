import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { useEffect } from 'react'
import { api } from '../../../convex/_generated/api'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { persistStorage, saveSnapshot } from '#/lib/offline-store'

/** Keeps the IndexedDB copy in step with the live data while online. */
export function SnapshotKeeper() {
  const { business } = useViewer()
  const { userId } = useAuth()
  const today = useToday()
  const snapshot = useQuery(api.offline.snapshot, {
    businessId: business._id,
    today,
  })
  useEffect(() => {
    if (!snapshot || !userId) return
    const id = window.setTimeout(() => {
      void saveSnapshot(userId, snapshot).then(persistStorage)
    }, 1000)
    return () => window.clearTimeout(id)
  }, [snapshot, userId])
  return null
}
