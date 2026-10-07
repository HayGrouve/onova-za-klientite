import { useClerk } from '@clerk/tanstack-react-start'
import {
  CaretDownIcon,
  ClipboardTextIcon,
  PlusIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  SignOutIcon,
  StorefrontIcon,
  SunIcon,
  UsersIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useViewer } from '#/hooks/use-viewer'
import { useOffline } from '#/hooks/use-connection'
import { OfflineBanner } from '#/components/offline/offline-banner'
import { Tip } from '#/components/tip'
import { TooltipProvider } from '#/components/ui/tooltip'
import { initials } from '#/lib/initials'
import { wipeSnapshots } from '#/lib/offline-store'
import { m } from '#/paraglide/messages.js'

/** The signed-in frame: header, the page, and the bottom nav with "+". */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { business } = useViewer()
  const { words } = business
  const pathname = useLocation({ select: (location) => location.pathname })
  const offline = useOffline()

  // Setup and "+" are full-screen flows of their own.
  if (pathname === '/setup' || pathname === '/new') return <>{children}</>

  return (
    <TooltipProvider delay={400}>
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <AppHeader />
        {offline && <OfflineBanner />}
        <main className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {/* Keyed by the address, so each page fades in when it opens. */}
          <div key={pathname} className="flex flex-1 animate-page flex-col">
            {children}
          </div>
        </main>
        <nav
          aria-label={m.nav_label()}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 shadow-[0_-4px_16px_-6px_rgb(0_0_0/0.08)] backdrop-blur supports-backdrop-filter:bg-background/85"
        >
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-1 pt-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <NavItem to="/" icon={SunIcon} label={m.nav_today()} />
            <NavItem
              to="/jobs"
              icon={ClipboardTextIcon}
              label={words.job.plural}
            />
            <div className="flex justify-center">
              <Tip
                label={m.new_job_label({ job: words.job.singular })}
                side="top"
              >
                <Link
                  to="/new"
                  aria-label={m.new_job_label({ job: words.job.singular })}
                  className="group/fab -mt-8 flex size-15 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 shadow-primary/30 ring-background transition-[transform,box-shadow] duration-200 outline-none hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 focus-visible:ring-ring/50 active:scale-90"
                >
                  <PlusIcon
                    className="size-7 transition-transform duration-300 group-hover/fab:rotate-90"
                    weight="bold"
                  />
                </Link>
              </Tip>
            </div>
            <NavItem
              to="/clients"
              icon={UsersIcon}
              label={words.client.plural}
            />
            <NavItem to="/money" icon={WalletIcon} label={m.nav_money()} />
          </div>
        </nav>
      </div>
    </TooltipProvider>
  )
}

function NavItem({
  to,
  icon: IconComponent,
  label,
}: {
  to: LinkProps['to']
  icon: Icon
  label: string
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="group flex min-h-12 flex-col items-center justify-end gap-0.5 rounded-xl text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:font-medium data-[status=active]:text-foreground"
    >
      {({ isActive }) => (
        <>
          <span className="relative flex h-8 w-14 items-center justify-center">
            {/* The pill behind the active icon grows in from the middle. */}
            <span
              aria-hidden
              className="absolute inset-0 scale-x-50 rounded-full bg-primary/12 opacity-0 transition-[scale,opacity] duration-300 ease-out group-data-[status=active]:scale-x-100 group-data-[status=active]:opacity-100"
            />
            <IconComponent
              className={cn(
                'relative size-6 transition-colors',
                isActive && 'animate-pop text-primary',
              )}
              weight={isActive ? 'fill' : 'regular'}
            />
          </span>
          <span className="max-w-full truncate px-1">{label}</span>
        </>
      )}
    </Link>
  )
}

function AppHeader() {
  const { user, business, businesses } = useViewer()
  const { signOut } = useClerk()
  const navigate = useNavigate()
  const setActive = useMutation(api.users.setActiveBusiness)
  const canSwitch = businesses.length > 1

  const switchTo = (businessId: string) => {
    if (businessId === business._id) return
    void setActive({ businessId: businessId as Id<'businesses'> }).then(() =>
      navigate({ to: '/' }),
    )
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-canvas/90 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
      {canSwitch ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={m.business_switch()}
            className="group/switch -ml-2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-left text-sm font-medium transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-foreground/5"
          >
            <BusinessMark />
            <span className="truncate">{business.name}</span>
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/switch:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.business_switch()}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={business._id}
                onValueChange={switchTo}
              >
                {businesses.map((item) => (
                  <DropdownMenuRadioItem
                    key={item._id}
                    value={item._id}
                    closeOnClick
                    className="min-h-11"
                  >
                    {item.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span
          className="flex min-w-0 items-center gap-2 text-sm font-medium"
          aria-label={m.business_current()}
        >
          <BusinessMark />
          <span className="truncate">{business.name}</span>
        </span>
      )}

      <div className="flex items-center gap-1">
        <Tip label={m.search_open()}>
          <Link
            to="/search"
            aria-label={m.search_open()}
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-primary/12 data-[status=active]:text-primary"
          >
            <MagnifyingGlassIcon className="size-6" />
          </Link>
        </Tip>
        <DropdownMenu>
          <Tip label={m.account_menu()}>
            <DropdownMenuTrigger
              aria-label={m.account_menu()}
              className="flex size-11 items-center justify-center rounded-full transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
            >
              <Avatar className="ring-2 ring-background">
                {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
                <AvatarFallback>
                  {initials(user.name || user.email || '?')}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">
                {user.email ?? user.name}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => void navigate({ to: '/settings' })}
            >
              <GearSixIcon />
              {m.account_settings()}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => void wipeSnapshots().then(() => signOut())}
            >
              <SignOutIcon />
              {m.account_sign_out()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

/** The small square in front of the business name. */
function BusinessMark() {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30"
    >
      <StorefrontIcon className="size-4" weight="fill" />
    </span>
  )
}
