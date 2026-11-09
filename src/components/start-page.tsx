import { useClerk } from '@clerk/tanstack-react-start'
import { WifiSlashIcon } from '@phosphor-icons/react'
import { LegalLinks } from '#/components/legal-links'
import { Button } from '#/components/ui/button'
import { usePageTitle } from '#/hooks/use-page-title'
import { signInReturnUrl } from '#/lib/safe-redirect'
import { m } from '#/paraglide/messages.js'

/**
 * What a signed-out visitor sees on `/`: the app's name, one line, the
 * sign-in button and the legal links. The public entry is the hub's project page, so this stays
 * out of search (`robots.txt`).
 */
export function StartPage() {
  const clerk = useClerk()
  return (
    <StartLayout>
      <Button
        size="xl"
        className="w-full max-w-xs"
        onClick={() =>
          void clerk.redirectToSignIn({
            redirectUrl: signInReturnUrl('/', window.location.origin),
          })
        }
      >
        {m.start_sign_in()}
      </Button>
    </StartLayout>
  )
}

/**
 * A cold start with no signal and nothing saved: Clerk can't load, so there
 * is no sign-in yet. The page reloads by itself once the phone is back online.
 */
export function OfflineStartPage() {
  return (
    <StartLayout>
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <WifiSlashIcon className="size-5 shrink-0" />
        {m.start_offline()}
      </p>
      <Button
        size="xl"
        variant="outline"
        className="w-full max-w-xs"
        onClick={() => window.location.reload()}
      >
        {m.offline_retry()}
      </Button>
    </StartLayout>
  )
}

function StartLayout({ children }: { children: React.ReactNode }) {
  usePageTitle(undefined)
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-1 animate-rise flex-col items-center justify-center gap-6 text-center">
        <img
          src="/icon.svg"
          alt=""
          width={72}
          height={72}
          className="size-18 rounded-2xl shadow-lg shadow-primary/25"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {m.app_name()}
          </h1>
          <p className="text-pretty text-muted-foreground">
            {m.app_description()}
          </p>
        </div>
        {children}
      </div>
      <LegalLinks className="mt-8 [&_ul]:justify-center" />
    </main>
  )
}
