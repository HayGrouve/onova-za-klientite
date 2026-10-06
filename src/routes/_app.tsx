import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { AppShell } from '#/components/app-shell'
import { CenteredMessage } from '#/components/centered-message'
import { Spinner } from '#/components/ui/spinner'
import { ViewerProvider } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app')({ component: SignedInLayout })

function Loading() {
  return (
    <CenteredMessage>
      <Spinner className="size-6 text-muted-foreground" />
      <span className="sr-only">{m.loading()}</span>
    </CenteredMessage>
  )
}

/** Route guards are client-side (ADR 0001). Convex does the real checks (ADR 0006). */
function SignedInLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Read the address once: depending on the router's location would
      // re-run this while the redirect itself is pending.
      const { pathname, search } = window.location
      void navigate({
        to: '/login',
        search: { redirect: pathname + search },
        replace: true,
      })
    }
  }, [isLoading, isAuthenticated, navigate])

  if (isLoading || !isAuthenticated) return <Loading />
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

  if (state === 'failed')
    return <CenteredMessage>{m.error_profile()}</CenteredMessage>
  if (state === 'pending') return <Loading />
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

  if (viewer === undefined || needsSetup) return <Loading />
  if (!viewer?.business)
    return <CenteredMessage>{m.error_profile()}</CenteredMessage>
  return (
    <ViewerProvider value={viewer}>
      <AppShell>
        <Outlet />
      </AppShell>
    </ViewerProvider>
  )
}
