import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { clerkPublishableKey, convexUrl } from '#/lib/env'
import { clerkLocalization } from '#/integrations/clerk-localization'
import { CenteredMessage } from '#/components/centered-message'
import { m } from '#/paraglide/messages.js'

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

// The app's own theme variables, so sign-in follows light and dark with it.
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: 'var(--primary)',
    colorPrimaryForeground: 'var(--primary-foreground)',
    colorBackground: 'var(--card)',
    colorForeground: 'var(--foreground)',
    colorMuted: 'var(--muted)',
    colorMutedForeground: 'var(--muted-foreground)',
    colorInput: 'var(--background)',
    colorInputForeground: 'var(--foreground)',
    colorBorder: 'var(--border)',
    colorNeutral: 'var(--foreground)',
    colorRing: 'var(--ring)',
    colorDanger: 'var(--destructive)',
    fontFamily: "'Sofia Sans Variable', system-ui, sans-serif",
    borderRadius: '0.75rem',
  },
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!convex) {
    return (
      <CenteredMessage role="alert">
        {m.config_missing({ name: 'VITE_CONVEX_URL' })}
      </CenteredMessage>
    )
  }
  if (!clerkPublishableKey) {
    return (
      <CenteredMessage role="alert">
        {m.config_missing({ name: 'VITE_CLERK_PUBLISHABLE_KEY' })}
      </CenteredMessage>
    )
  }
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      localization={clerkLocalization}
      appearance={CLERK_APPEARANCE}
      signInUrl="/login"
      afterSignOutUrl="/login"
      allowedRedirectOrigins={
        typeof window === 'undefined' ? [] : [window.location.origin]
      }
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
