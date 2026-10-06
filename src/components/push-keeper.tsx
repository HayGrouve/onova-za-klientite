import { useMutation } from 'convex/react'
import { useEffect } from 'react'
import { api } from '../../convex/_generated/api'
import { vapidPublicKey } from '#/lib/env'
import { resubscribeIfLost, subscriptionArgs } from '#/lib/push'

/**
 * On every app open, when the permission is granted but the subscription is
 * gone, subscribes again, and tells the server this device's subscription
 * (ADR 0011). Never asks for permission: that comes from the Settings switch.
 */
export function PushKeeper() {
  const subscribe = useMutation(api.push.subscribe)

  useEffect(() => {
    if (!vapidPublicKey) return
    let cancelled = false
    resubscribeIfLost(vapidPublicKey)
      .then(async (subscription) => {
        if (subscription && !cancelled) {
          await subscribe(subscriptionArgs(subscription))
        }
      })
      .catch(() => {
        // Best effort: the next open tries again.
      })
    return () => {
      cancelled = true
    }
  }, [subscribe])

  return null
}
