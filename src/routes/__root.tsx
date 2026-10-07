import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import { AppProviders } from '#/integrations/providers'
import { CenteredMessage } from '#/components/centered-message'
import { ServiceWorkerRegister } from '#/components/service-worker-register'
import { Button } from '#/components/ui/button'
import { Toaster } from '#/components/ui/sonner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import appCss from '../styles.css?url'

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
  }),
  component: RootLayout,
  shellComponent: RootDocument,
  errorComponent: RootError,
})

function RootLayout() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  )
}

function RootError({ error }: ErrorComponentProps) {
  return (
    <CenteredMessage>
      <h1 className="text-lg font-semibold">{m.error_title()}</h1>
      <p className="text-muted-foreground" role="alert">
        {errorMessage(error)}
      </p>
      <Button
        size="lg"
        className="h-12 rounded-xl px-5"
        onClick={() => window.location.reload()}
      >
        <ArrowClockwiseIcon aria-hidden />
        {m.error_retry()}
      </Button>
    </CenteredMessage>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster position="top-center" />
        <ServiceWorkerRegister />
        <Scripts />
      </body>
    </html>
  )
}
