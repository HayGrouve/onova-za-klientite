import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useAuth, useClerk } from '@clerk/tanstack-react-start'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

/** A user row that vanishes again this soon after being made means something is wrong. */
const FRESH_START_GAP_MS = 10_000

function EnsureUser() {
  const ensureCurrent = useMutation(api.users.ensureCurrent)
  const [state, setState] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [round, setRound] = useState(0)
  const lastFreshStart = useRef(0)

  useEffect(() => {
    let cancelled = false
    ensureCurrent()
      .then(() => !cancelled && setState('ready'))
      .catch(() => !cancelled && setState('failed'))
    return () => {
      cancelled = true
    }
  }, [ensureCurrent, round])

  // Still signed in but the user row is gone (Remove project data): make a fresh
  // one, which lands on setup like a first sign-in.
  const startFresh = useCallback(() => {
    const now = Date.now()
    if (now - lastFreshStart.current < FRESH_START_GAP_MS) {
      setState('failed')
      return
    }
    lastFreshStart.current = now
    setState('pending')
    setRound((count) => count + 1)
  }, [])

  if (state === 'failed') return <ProfileError />
  if (state === 'pending') return <StartingUp />
  return <WithViewer onUserGone={startFresh} />
}

function WithViewer({ onUserGone }: { onUserGone: () => void }) {
  const viewer = useQuery(api.users.viewer)
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const needsSetup =
    viewer?.business?.setupDone === false && pathname !== '/setup'
  const userGone = viewer === null

  // First run: sign in → Setup → Today.
  useEffect(() => {
    if (needsSetup) void navigate({ to: '/setup', replace: true })
  }, [needsSetup, navigate])

  useEffect(() => {
    if (userGone) onUserGone()
  }, [userGone, onUserGone])

  if (viewer === undefined || needsSetup || userGone) return <StartingUp />
  if (!viewer.business) return <ProfileError />
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
