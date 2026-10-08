import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

type Settings = FunctionReturnType<typeof api.businesses.settings>

/**
 * Applies a Settings change to the cached `businesses.settings` at once, so a
 * switch and its preview move at the tap instead of after the round trip.
 */
export function patchSettings(
  store: OptimisticLocalStore,
  businessId: Id<'businesses'>,
  patch: Partial<Settings>,
) {
  const current = store.getQuery(api.businesses.settings, { businessId })
  if (current) {
    store.setQuery(
      api.businesses.settings,
      { businessId },
      { ...current, ...patch },
    )
  }
}
