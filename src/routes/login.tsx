import { useAuth, useClerk } from '@clerk/tanstack-react-start'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { CenteredMessage } from '#/components/centered-message'
import { safeRedirect, signInReturnUrl } from '#/lib/safe-redirect'
import { m } from '#/paraglide/messages.js'

/**
 * Old bookmarks and installed copies still open `/login`. It renders no sign-in
 * of its own: it sends the person to sign-in (the hub's page in production,
 * Clerk's Account Portal elsewhere), which brings them back to `redirect`.
 * Already signed in, it goes straight back there (ADR 0012).
 */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginRedirect,
})

function LoginRedirect() {
  const { redirect } = Route.useSearch()
  const { isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      void navigate({ to: redirect, replace: true })
      return
    }
    void clerk.redirectToSignIn({
      redirectUrl: signInReturnUrl(redirect, window.location.origin),
    })
  }, [isLoaded, isSignedIn, clerk, navigate, redirect])

  return <CenteredMessage role="status">{m.loading()}</CenteredMessage>
}
