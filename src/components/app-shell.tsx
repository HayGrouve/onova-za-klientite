import { useClerk } from '@clerk/tanstack-react-start'
import {
  CaretDownIcon,
  CaretUpDownIcon,
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
import {
  Link,
  useLocation,
  useMatches,
  useNavigate,
} from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { useEffect } from 'react'
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
import { buttonVariants } from '#/components/ui/button'
import { TooltipProvider } from '#/components/ui/tooltip'
import { initials } from '#/lib/initials'
import { wipeSnapshots } from '#/lib/offline-store'
import { isShortcut, shortcutBlockedAt } from '#/lib/shortcuts'
import { m } from '#/paraglide/messages.js'

type NavEntry = { to: LinkProps['to']; icon: Icon; label: string }

/**
 * The main screens, in nav order. The phone's bottom bar and the wide screen's
 * sidebar both read this list, so a new screen (Level 2's Calendar and Team)
 * is one more entry.
 */
function useNavEntries(): NavEntry[] {
  const { words } = useViewer().business
  return [
    { to: '/', icon: SunIcon, label: m.nav_today() },
    { to: '/jobs', icon: ClipboardTextIcon, label: words.job.plural },
    { to: '/clients', icon: UsersIcon, label: words.client.plural },
    { to: '/money', icon: WalletIcon, label: m.nav_money() },
  ]
}

// How wide a page may grow beside the sidebar (`staticData.layout`).
const PAGE_WIDTH = {
  reading: 'lg:max-w-3xl',
  wide: 'lg:max-w-6xl',
  full: 'lg:max-w-none',
}

/**
 * The signed-in frame. On a phone: header, the page, and the bottom nav with
 * "+". On a wide screen (lg and up): a sidebar with the same screens, and the
 * page as wide as its route allows.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { business } = useViewer()
  const { words } = business
  const pathname = useLocation({ select: (location) => location.pathname })
  const layout = useMatches({
    select: (matches) =>
      matches.reduce<keyof typeof PAGE_WIDTH>(
        (width, match) => match.staticData.layout ?? width,
        'reading',
      ),
  })
  // A frame route keeps its page while its children change (`staticData.frame`).
  const pageKey = useMatches({
    select: (matches) =>
      matches.find((match) => match.staticData.frame)?.pathname,
  })
  const offline = useOffline()
  const nav = useNavEntries()
  useShortcuts()

  // Setup and "+" are full-screen flows of their own.
  if (pathname === '/setup' || pathname === '/new') return <>{children}</>

  const [today, jobs, clients, money] = nav
  return (
    <TooltipProvider delay={400}>
      <div className="flex min-h-dvh">
        <SkipLink />
        <Sidebar entries={nav} />
        <div className="mx-auto flex min-h-dvh w-full max-w-lg min-w-0 flex-col lg:max-w-none">
          <AppHeader />
          {offline && <OfflineBanner />}
          <main
            id="main"
            tabIndex={-1}
            className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none lg:px-4 lg:pt-6 lg:pb-12"
          >
            {/* Keyed by the address, so each page fades in when it opens. */}
            <div
              key={pageKey ?? pathname}
              className={cn(
                'flex w-full flex-1 animate-page flex-col lg:mx-auto',
                PAGE_WIDTH[layout],
              )}
            >
              {children}
            </div>
          </main>
        </div>
        <nav
          aria-label={m.nav_label()}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 shadow-[0_-4px_16px_-6px_rgb(0_0_0/0.08)] backdrop-blur supports-backdrop-filter:bg-background/85 lg:hidden"
        >
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-1 pt-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <NavItem {...today} />
            <NavItem {...jobs} />
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
            <NavItem {...clients} />
            <NavItem {...money} />
          </div>
        </nav>
      </div>
    </TooltipProvider>
  )
}

const MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
const SEARCH_SHORTCUT = MAC ? '⌘K' : 'Ctrl K'
const NEW_JOB_SHORTCUT = 'N'

/**
 * Keys for a desktop: Ctrl+K (⌘K on a Mac) opens search from anywhere, as in
 * most desktop apps, and a plain N starts a new job, unless someone is typing
 * or a dialog or menu is open.
 */
function useShortcuts() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcut(event, 'k', true)) {
        event.preventDefault()
        void navigate({ to: '/search' })
      } else if (
        isShortcut(event, 'n') &&
        !shortcutBlockedAt(event.target) &&
        // Setup and "+" are full screens of their own.
        !['/new', '/setup'].includes(window.location.pathname)
      ) {
        event.preventDefault()
        void navigate({ to: '/new' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}

/** The first Tab stop: jumps past the sidebar or the header to the page. */
function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(event) => {
        // A plain hash link would change the address and the router's state.
        event.preventDefault()
        document.getElementById('main')?.focus()
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {m.skip_to_content()}
    </a>
  )
}

function NavItem({ to, icon: IconComponent, label }: NavEntry) {
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

/** The wide screen's left rail: business, "+", the main screens, search, settings, profile. */
function Sidebar({ entries }: { entries: NavEntry[] }) {
  const { words } = useViewer().business
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-4 border-r border-border/70 bg-background px-3 py-4 lg:flex xl:w-64">
      <BusinessSwitcher />
      <Link
        to="/new"
        aria-keyshortcuts={NEW_JOB_SHORTCUT}
        className={buttonVariants({
          size: 'lg',
          className:
            'group/new relative h-10 w-full shadow-sm shadow-primary/30',
        })}
      >
        <PlusIcon
          data-icon="inline-start"
          weight="bold"
          className="transition-transform duration-300 group-hover/new:rotate-90"
        />
        {words.job.singular}
        <kbd
          aria-hidden
          className="absolute right-2.5 rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1.5 font-sans text-[0.6875rem] text-primary-foreground"
        >
          {NEW_JOB_SHORTCUT}
        </kbd>
      </Link>
      <nav aria-label={m.nav_label()} className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <SidebarLink key={String(entry.to)} {...entry} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        <SidebarLink
          to="/search"
          icon={MagnifyingGlassIcon}
          label={m.search_open()}
          shortcut={SEARCH_SHORTCUT}
        />
        <SidebarLink
          to="/settings"
          icon={GearSixIcon}
          label={m.account_settings()}
        />
        <div aria-hidden className="mx-2 my-1 h-px bg-border/70" />
        <AccountMenu wide />
      </div>
    </aside>
  )
}

function SidebarLink({
  to,
  icon: IconComponent,
  label,
  shortcut,
}: NavEntry & { shortcut?: string }) {
  return (
    <Link
      to={to}
      aria-keyshortcuts={shortcut === SEARCH_SHORTCUT ? 'Control+K' : undefined}
      activeOptions={{ exact: to === '/' }}
      className="group flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-foreground/80 transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-primary/10 data-[status=active]:font-medium data-[status=active]:text-primary"
    >
      {({ isActive }) => (
        <>
          <IconComponent
            aria-hidden
            className="size-5 shrink-0"
            weight={isActive ? 'fill' : 'regular'}
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {shortcut && (
            <kbd className="rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </>
      )}
    </Link>
  )
}

/** The phone's top bar. A wide screen has all of this in the sidebar. */
function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-canvas/90 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 backdrop-blur lg:hidden">
      <BusinessSwitcher />
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
        <AccountMenu />
      </div>
    </header>
  )
}

/** The business name, and a menu to switch when the user has more than one. */
export function BusinessSwitcher() {
  const { business, businesses } = useViewer()
  const navigate = useNavigate()
  const setActive = useMutation(api.users.setActiveBusiness)

  const switchTo = (businessId: string) => {
    if (businessId === business._id) return
    void setActive({ businessId: businessId as Id<'businesses'> }).then(() =>
      navigate({ to: '/' }),
    )
  }

  if (businesses.length < 2) {
    return (
      <span
        className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium lg:px-2"
        aria-label={m.business_current()}
      >
        <BusinessMark />
        <span className="truncate">{business.name}</span>
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={m.business_switch()}
        className="group/switch -ml-2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-left text-sm font-medium transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-foreground/5 lg:ml-0"
      >
        <BusinessMark />
        <span className="min-w-0 flex-1 truncate">{business.name}</span>
        <CaretDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/switch:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.business_switch()}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={business._id} onValueChange={switchTo}>
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
  )
}

/**
 * The profile menu: settings and sign out. On the phone it is the avatar in
 * the header; in the sidebar (`wide`) it also shows the name and email.
 */
function AccountMenu({ wide = false }: { wide?: boolean }) {
  const { user } = useViewer()
  const { signOut } = useClerk()
  const navigate = useNavigate()
  const avatar = (
    <Avatar className="ring-2 ring-background">
      {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback>
        {initials(user.name || user.email || '?')}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <DropdownMenu>
      {wide ? (
        <DropdownMenuTrigger
          aria-label={m.account_menu()}
          className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-foreground/5"
        >
          {avatar}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {user.name || user.email}
            </span>
            {user.name && user.email && (
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            )}
          </span>
          <CaretUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
      ) : (
        <Tip label={m.account_menu()}>
          <DropdownMenuTrigger
            aria-label={m.account_menu()}
            className="flex size-11 items-center justify-center rounded-full transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
          >
            {avatar}
          </DropdownMenuTrigger>
        </Tip>
      )}
      <DropdownMenuContent
        align={wide ? 'start' : 'end'}
        side={wide ? 'top' : 'bottom'}
        className="w-64"
      >
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
