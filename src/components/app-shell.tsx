import { useClerk } from '@clerk/tanstack-react-start'
import {
  CaretDownIcon,
  ClipboardTextIcon,
  PlusIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  SignOutIcon,
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
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <AppHeader />
      {offline && <OfflineBanner />}
      <main className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <nav
        aria-label={m.nav_label()}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-1 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <NavItem to="/" icon={SunIcon} label={m.nav_today()} />
          <NavItem
            to="/jobs"
            icon={ClipboardTextIcon}
            label={words.job.plural}
          />
          <div className="flex justify-center">
            <Link
              to="/new"
              aria-label={m.new_job_label({ job: words.job.singular })}
              className="-mt-7 flex size-15 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
            >
              <PlusIcon className="size-7" weight="bold" />
            </Link>
          </div>
          <NavItem to="/clients" icon={UsersIcon} label={words.client.plural} />
          <NavItem to="/money" icon={WalletIcon} label={m.nav_money()} />
        </div>
      </nav>
    </div>
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
      className="group flex min-h-12 flex-col items-center justify-end gap-1 rounded-xl text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:font-medium data-[status=active]:text-foreground"
    >
      {({ isActive }) => (
        <>
          <IconComponent
            className="size-6"
            weight={isActive ? 'fill' : 'regular'}
          />
          <span className="max-w-full truncate px-1">{label}</span>
        </>
      )}
    </Link>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-background/95 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
      {canSwitch ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={m.business_switch()}
            className="-ml-2 flex min-h-11 min-w-0 items-center gap-1 rounded-xl px-2 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="truncate">{business.name}</span>
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
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
          className="min-w-0 truncate text-sm font-medium"
          aria-label={m.business_current()}
        >
          {business.name}
        </span>
      )}

      <div className="flex items-center gap-1">
        <Link
          to="/search"
          aria-label={m.search_open()}
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MagnifyingGlassIcon className="size-6" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={m.account_menu()}
            className={cn(
              'flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            )}
          >
            <Avatar>
              {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
              <AvatarFallback>
                {initials(user.name || user.email || '?')}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
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
