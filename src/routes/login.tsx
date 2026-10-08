import { SignIn, useAuth } from '@clerk/tanstack-react-start'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { CenteredMessage } from '#/components/centered-message'
import { usePageTitle } from '#/hooks/use-page-title'
import { safeRedirect } from '#/lib/safe-redirect'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginPage,
})

function LoginPage() {
  usePageTitle(m.login_title())
  const { redirect } = Route.useSearch()
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoaded && isSignedIn) void navigate({ to: redirect })
  }, [isLoaded, isSignedIn, navigate, redirect])

  if (!isLoaded || isSignedIn) {
    return <CenteredMessage>{m.loading()}</CenteredMessage>
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-6 px-4 py-10">
      <div className="flex animate-rise flex-col items-center gap-2 text-center">
        <img
          src="/icon.svg"
          alt=""
          className="mb-2 size-16 rounded-2xl shadow-lg shadow-primary/25"
        />
        <p className="text-sm font-medium text-primary">{m.app_name()}</p>
        <h1 className="text-2xl font-semibold">{m.login_title()}</h1>
        <p className="text-muted-foreground">{m.login_body()}</p>
      </div>
      <SignIn
        routing="hash"
        forceRedirectUrl={redirect}
        fallbackRedirectUrl={redirect}
      />
    </main>
  )
}
