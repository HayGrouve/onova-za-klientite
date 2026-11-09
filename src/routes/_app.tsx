import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useAuth, useClerk } from '@clerk/tanstack-react-start'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '#/components/app-shell'
import { SnapshotKeeper } from '#/components/offline/snapshot-keeper'
import { StartedUp, StartingUp } from '#/components/offline/starting-up'
import { CenteredMessage } from '#/components/centered-message'
import { StartPage } from '#/components/start-page'
import { PushKeeper } from '#/components/push-keeper'
import { Button } from '#/components/ui/button'
import { ViewerProvider } from '#/hooks/use-viewer'
import { signInReturnUrl } from '#/lib/safe-redirect'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app')({ component: SignedInLayout })

function ProfileError() {
  return (
    <CenteredMessage role="alert">
      <p>{m.error_profile()}</p>
      <Button size="xl" onClick={() => window.location.reload()}>
        {m.error_retry()}
      </Button>
    </CenteredMessage>
  )
}

/**
 * Route guards are client-side (ADR 0001). Convex does the real checks (ADR
 * 0006). Signed out, `/` is the start page and any other page goes straight
 * to sign-in, which brings the person back to it (ADR 0012).
 */
function SignedInLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const onStart = useLocation({
    select: (location) => location.pathname === '/',
  })
  const signedOut = !isLoading && !isAuthenticated && !isSignedIn
  // Clerk has a session that Convex turned down: sending the person to
  // sign-in would only bounce them back here, again and again.
  const refused = !isLoading && !isAuthenticated && isSignedIn === true

  useEffect(() => {
    if (!signedOut || onStart) return
    // Read the address once: depending on the router's location would
    // re-run this while the redirect itself is pending.
    const { pathname, search, hash } = window.location
    void clerk.redirectToSignIn({
      redirectUrl: signInReturnUrl(
        pathname + search + hash,
        window.location.origin,
      ),
    })
  }, [signedOut, onStart, clerk])

  if (refused) return <ProfileError />
  if (signedOut && onStart) return <StartPage />
  if (isLoading || !isAuthenticated) return <StartingUp />
  return <EnsureUser />
}

function EnsureUser() {
  const ensureCurrent = useMutation(api.users.ensureCurrent)
  const [state, setState] = useState<'pending' | 'ready' | 'failed'>('pending')

  useEffect(() => {
    let cancelled = false
    ensureCurrent()
      .then(() => !cancelled && setState('ready'))
      .catch(() => !cancelled && setState('failed'))
    return () => {
      cancelled = true
    }
  }, [ensureCurrent])

  if (state === 'failed') return <ProfileError />
  if (state === 'pending') return <StartingUp />
  return <WithViewer />
}

function WithViewer() {
  const viewer = useQuery(api.users.viewer)
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const needsSetup =
    viewer?.business?.setupDone === false && pathname !== '/setup'

  // First run: sign in → Setup → Today.
  useEffect(() => {
    if (needsSetup) void navigate({ to: '/setup', replace: true })
  }, [needsSetup, navigate])

  if (viewer === undefined || needsSetup) return <StartingUp />
  if (!viewer?.business) return <ProfileError />
  return (
    <ViewerProvider value={viewer}>
      <StartedUp />
      <PushKeeper />
      <SnapshotKeeper />
      <AppShell>
        <Outlet />
      </AppShell>
    </ViewerProvider>
  )
}
