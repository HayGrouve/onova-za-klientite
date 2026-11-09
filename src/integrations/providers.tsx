import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import {
  clerkPublishableKey,
  clerkSignInUrl,
  clerkSignUpUrl,
  convexUrl,
} from '#/lib/env'
import { SnapshotWiper } from '#/components/offline/snapshot-wiper'
import { CenteredMessage } from '#/components/centered-message'
import { m } from '#/paraglide/messages.js'

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

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
    // No Clerk UI renders here: sign-in is the hub's page in production and
    // Clerk's Account Portal elsewhere (ADR 0012). A prop beats the env in
    // this SDK, so the URLs are passed only when set.
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      {...(clerkSignInUrl ? { signInUrl: clerkSignInUrl } : {})}
      {...(clerkSignUpUrl ? { signUpUrl: clerkSignUpUrl } : {})}
      afterSignOutUrl="/"
      allowedRedirectOrigins={
        typeof window === 'undefined' ? [] : [window.location.origin]
      }
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SnapshotWiper />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
