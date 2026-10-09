import { PlusCircleIcon } from '@phosphor-icons/react'
import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
} from '@tanstack/react-router'
import { settingsGroups, useAddBusiness } from '#/components/settings/sections'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings')({
  staticData: { layout: 'wide', frame: true },
  component: SettingsLayout,
})

/**
 * Settings on a wide screen: the sections in a side menu, the open one beside
 * it. A phone opens each section as its own page from the list.
 */
function SettingsLayout() {
  const wide = useWide()
  const pathname = useLocation({ select: (location) => location.pathname })
  if (!wide) {
    return (
      <div key={pathname} className="flex flex-1 animate-page flex-col">
        <Outlet />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-[16rem_minmax(0,1fr)] items-start gap-4">
      <SettingsMenu />
      {/* Only the open section fades in; the menu stays. */}
      <div
        key={pathname}
        className="flex max-w-5xl min-w-0 animate-page flex-col"
      >
        <Outlet />
      </div>
    </div>
  )
}

function SettingsMenu() {
  const { business } = useViewer()
  const { role } = business
  const { add, busy } = useAddBusiness()
  const item =
    'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-foreground/80 transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
  return (
    <nav
      aria-label={m.settings_title()}
      className="sticky top-6 flex flex-col gap-0.5 pl-4"
    >
      <p className="px-3 pt-2 pb-3 text-3xl font-semibold tracking-tight">
        {m.settings_title()}
      </p>
      {role !== 'owner' && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          {m.settings_owner_only()}
        </p>
      )}
      {settingsGroups().map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5 pb-2">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
            {group.title}
          </p>
          {group.sections.map(({ to, icon: IconComponent, title }) => (
            <Link
              key={String(to)}
              to={to}
              className={`${item} data-[status=active]:bg-primary/10 data-[status=active]:font-medium data-[status=active]:text-primary`}
            >
              {({ isActive }) => (
                <>
                  <IconComponent
                    aria-hidden
                    className="size-5 shrink-0"
                    weight={isActive ? 'fill' : 'regular'}
                  />
                  <span className="truncate">{title}</span>
                </>
              )}
            </Link>
          ))}
        </div>
      ))}
      <div aria-hidden className="mx-3 my-1.5 h-px bg-border/70" />
      <button
        type="button"
        disabled={busy}
        onClick={add}
        className={`${item} text-left disabled:opacity-60`}
      >
        {busy ? (
          <Spinner className="size-5" />
        ) : (
          <PlusCircleIcon aria-hidden className="size-5 shrink-0" />
        )}
        <span className="truncate">{m.business_add()}</span>
      </button>
    </nav>
  )
}
