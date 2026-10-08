import {
  ClipboardTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
  UsersIcon,
} from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { ListExtras } from '#/components/list-extras'
import { InitialsAvatar } from '#/components/initials-avatar'
import { JobRow } from '#/components/job-row'
import { ListSection } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { buttonVariants } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { useUrlText } from '#/hooks/use-url-text'
import { usePageTitle } from '#/hooks/use-page-title'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { formatPhone } from '../../../shared/phone-format'
import { textParam } from '../../../shared/sort'

export const Route = createFileRoute('/_app/search')({
  // The words live in the address, so Back from a result returns to them.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = textParam(search.q)
    return q !== undefined ? { q } : {}
  },
  staticData: { layout: 'wide' },
  component: SearchPage,
})

/** The words typed become the new client's phone if they read as one, else its name. */
function prefillClient(query: string) {
  const isPhone =
    /^[\d\s+()-]+$/.test(query) && /\d{5}/.test(query.replace(/\D/g, ''))
  return isPhone ? { phone: query } : { name: query }
}

function SearchPage() {
  usePageTitle(m.search_open())
  const { business } = useViewer()
  const today = useToday()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // The box commits to the address once typing pauses, so each keystroke
  // doesn't run a search; the address is what the query reads.
  const searchText = useUrlText(
    search.q ?? '',
    (value) =>
      void navigate({
        search: { q: value.trim() ? value : undefined },
        replace: true,
      }),
  )
  const debounced = (search.q ?? '').trim()
  const results = useQuery(
    api.search.all,
    debounced ? { businessId: business._id, query: debounced } : 'skip',
  )
  const { words } = business
  const total = results
    ? results.clients.length + results.jobs.length + results.items.length
    : 0
  const empty = results && total === 0

  return (
    <div className="flex flex-col gap-4 pt-2">
      <h1 className="sr-only">{m.search_open()}</h1>
      <div className="px-4 lg:max-w-2xl">
        <InputGroup className="lg:h-12 lg:bg-card lg:text-base">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            type="search"
            name="q"
            enterKeyHint="search"
            spellCheck={false}
            aria-label={m.search_open()}
            placeholder={m.search_placeholder()}
            {...searchText}
          />
        </InputGroup>
        {!debounced && (
          <p className="pt-2 text-sm text-muted-foreground">
            {m.search_hint()}
          </p>
        )}
        {/* Mounted empty, then filled, so a screen reader announces the answer. */}
        <div role="status">
          {empty && (
            <p className="animate-rise pt-6 pb-3 text-center text-muted-foreground">
              {m.search_none()}
            </p>
          )}
          {results && total > 0 && (
            <span className="sr-only">
              {m.search_results_status({ count: total })}
            </span>
          )}
        </div>
      </div>
      {empty && (
        <div className="flex animate-rise justify-center px-4">
          <Link
            to="/clients/new"
            search={prefillClient(debounced)}
            aria-label={m.clients_add({ client: words.client.singular })}
            className={buttonVariants({ variant: 'outline', size: 'xl' })}
          >
            <PlusIcon data-icon="inline-start" />
            {words.client.singular}
          </Link>
        </div>
      )}
      {debounced && !results && <ListSkeleton />}
      {/* A wide screen shows the kinds of result side by side. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] lg:items-start">
        {results && results.clients.length > 0 && (
          <ListSection
            title={words.client.plural}
            icon={UsersIcon}
            count={results.clients.length}
          >
            {results.clients.map((client) => (
              <li key={client._id}>
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: client._id }}
                  className="flex items-center gap-3 pressable px-4 py-3"
                >
                  <InitialsAvatar
                    name={client.isNoClient ? m.no_client() : client.name}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {client.isNoClient ? m.no_client() : client.name}
                    </span>
                    {client.phone && (
                      <span className="text-sm text-muted-foreground">
                        {formatPhone(client.phone)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ListSection>
        )}
        {results && results.jobs.length > 0 && (
          <ListSection
            title={words.job.plural}
            icon={ClipboardTextIcon}
            count={results.jobs.length}
          >
            {results.jobs.map((job) => (
              <JobRow key={job._id} job={job} today={today} />
            ))}
          </ListSection>
        )}
        {results && results.items.length > 0 && (
          <ListSection
            title={words.item.plural}
            icon={StackIcon}
            count={results.items.length}
          >
            {results.items.map((item) => (
              <li key={item._id}>
                <Link
                  to="/items/$itemId"
                  params={{ itemId: item._id }}
                  className="flex min-w-0 flex-col pressable px-4 py-3"
                >
                  <span className="font-medium break-words">{item.name}</span>
                  <span className="text-sm break-words text-muted-foreground">
                    {item.clientName}
                  </span>
                  <ListExtras target="item" values={item.listExtra} />
                </Link>
              </li>
            ))}
          </ListSection>
        )}
      </div>
    </div>
  )
}
