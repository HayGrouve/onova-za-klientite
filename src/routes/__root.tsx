import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { AppProviders } from '#/integrations/providers'
import { loadLastSnapshot } from '#/lib/offline-store'
import type { SavedSnapshot } from '#/lib/offline-store'
import { ErrorView } from '#/components/error-view'
import { ServiceWorkerRegister } from '#/components/service-worker-register'
import { Toaster } from '#/components/ui/sonner'
import { applyTimingFlag } from '#/lib/timing'
import { lazy, Suspense, useEffect, useState } from 'react'
import { m } from '#/paraglide/messages.js'
import appCss from '../styles.css?url'

// The theme follows the system's light or dark setting. It runs in <head>,
// before the first paint, so a dark screen never flashes white, and it
// follows a change while the app is open.
// The browser bar takes the brand blue in light and the page colour in dark.
const THEME_SCRIPT = `(function(){var q=window.matchMedia('(prefers-color-scheme: dark)');function a(){var d=q.matches,e=document.documentElement,t=document.querySelectorAll('meta[name="theme-color"]');e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';t.forEach(function(m){m.setAttribute('content',d?'#18181b':'#2453a4')})}a();q.addEventListener('change',a)})()`

// Only a cold start without signal needs it, so it stays out of the main bundle.
const OfflineApp = lazy(() =>
  import('#/components/offline/offline-app').then((module) => ({
    default: module.OfflineApp,
  })),
)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: m.app_name() },
      { name: 'description', content: m.app_description() },
      { name: 'theme-color', content: '#2453a4' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: m.app_short_name() },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
  errorComponent: RootError,
})

function RootLayout() {
  // The SPA shell is prerendered without a browser, so nothing renders until
  // mounted: the first client render then matches it (no hydration error).
  const [mode, setMode] = useState<'pending' | 'online' | 'offline'>('pending')
  const [saved, setSaved] = useState<SavedSnapshot | null | undefined>(
    undefined,
  )
  useEffect(() => {
    applyTimingFlag(window.location.search)
    // A cold start with no signal shows the last snapshot read-only (ADR 0010).
    if (navigator.onLine) {
      setMode('online')
      return
    }
    setMode('offline')
    void loadLastSnapshot().then(setSaved)
    const reload = () => window.location.reload()
    window.addEventListener('online', reload)
    return () => window.removeEventListener('online', reload)
  }, [])
  if (mode === 'pending') return null
  if (mode === 'offline') {
    return saved === undefined ? null : (
      <Suspense fallback={null}>
        <OfflineApp saved={saved} />
      </Suspense>
    )
  }
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  )
}

function RootError({ error }: ErrorComponentProps) {
  return <ErrorView error={error} />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets the class before React loads.
    <html lang="bg" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* Above the phone's bottom nav, where the thumb is, and never over
            the header's search and business switcher (--toast-bottom). */}
        <Toaster
          position="bottom-center"
          offset={{ bottom: 'var(--toast-bottom)' }}
          mobileOffset={{ bottom: 'var(--toast-bottom)' }}
        />
        <ServiceWorkerRegister />
        <Scripts />
      </body>
    </html>
  )
}
