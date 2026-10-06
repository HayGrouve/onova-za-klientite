import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { clerkPublishableKey, convexUrl } from '#/lib/env'
import { clerkLocalization } from '#/integrations/clerk-localization'
import { CenteredMessage } from '#/components/centered-message'
import { m } from '#/paraglide/messages.js'

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: 'oklch(0.45 0.15 258)',
    fontFamily: "'Sofia Sans Variable', system-ui, sans-serif",
    borderRadius: '0.75rem',
  },
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!convex) {
    return (
      <CenteredMessage>
        {m.config_missing({ name: 'VITE_CONVEX_URL' })}
      </CenteredMessage>
    )
  }
  if (!clerkPublishableKey) {
    return (
      <CenteredMessage>
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
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
