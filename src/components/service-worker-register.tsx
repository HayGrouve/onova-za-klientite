import { useEffect } from 'react'
import { toast } from 'sonner'
import { m } from '#/paraglide/messages.js'

/**
 * Registers `/sw.js` in production builds. A new version waits until the
 * person taps the update action instead of taking over silently (ADR 0010).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    const offerUpdate = (worker: ServiceWorker) => {
      toast(m.update_available(), {
        duration: Infinity,
        action: {
          label: m.update_reload(),
          onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        },
      })
    }

    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          offerUpdate(registration.waiting)
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              offerUpdate(worker)
            }
          })
        })
      })
      .catch(() => {
        // Best effort: the app works online without a service worker.
      })
  }, [])

  return null
}
