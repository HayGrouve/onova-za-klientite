import {
  CaretRightIcon,
  CoinsIcon,
  MagnifyingGlassIcon,
  PiggyBankIcon,
  PlusIcon,
  UserCircleDashedIcon,
  UsersIcon,
} from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { CLIENT_SORT_KEYS, ClientsTable } from '#/components/clients-table'
import type { ClientSortKey } from '#/components/clients-table'
import { InitialsAvatar } from '#/components/initials-avatar'
import { ListCard } from '#/components/list-section'
import { ListExtras } from '#/components/list-extras'
import { ListSkeleton } from '#/components/list-skeleton'
import { EmptyState, PageTitle } from '#/components/page'
import { buttonVariants } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { useUrlText } from '#/hooks/use-url-text'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'
import { formatPhone } from '../../../shared/phone-format'
import { asCandidate, searchClients } from '../../../shared/search'
import {
  nextSort,
  parseSortSearch,
  sortFromSearch,
  sortToSearch,
  textParam,
} from '../../../shared/sort'
import type { SortSearch } from '../../../shared/sort'

/** The search words and the table's sort live in the address, so Back returns to the same list. */
type ClientsSearch = { q?: string } & SortSearch<ClientSortKey>

export const Route = createFileRoute('/_app/clients/')({
  validateSearch: (search: Record<string, unknown>): ClientsSearch => {
    const q = textParam(search.q)
    return {
      ...(q !== undefined && { q }),
      ...parseSortSearch(search, CLIENT_SORT_KEYS),
    }
  },
  staticData: { layout: 'wide' },
  component: ClientsPage,
})

/** "+ Client": the one way to add from this page. */
function AddClientLink({ primary = false }: { primary?: boolean }) {
  const { words } = useViewer().business
  return (
    <Link
      to="/clients/new"
      aria-label={m.clients_add({ client: words.client.singular })}
      className={buttonVariants({
        variant: primary ? 'default' : 'outline',
        size: 'xl',
        className: primary ? undefined : 'shadow-xs',
      })}
    >
      <PlusIcon data-icon="inline-start" />
      {words.client.singular}
    </Link>
  )
}

function ClientsPage() {
  const { business } = useViewer()
  const clients = useQuery(api.clients.list, { businessId: business._id })
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // In place: Back leaves the list, not the last keystroke or click.
  const setSearch = (patch: ClientsSearch) =>
    void navigate({
      search: (current) => ({ ...current, ...patch }),
      replace: true,
    })
  const query = search.q ?? ''
  const searchText = useUrlText(query, (value) =>
    setSearch({ q: value.trim() ? value : undefined }),
  )
  const sort = sortFromSearch(search)
  const wide = useWide()
  const { words } = business

  const shown = !clients
    ? []
    : query.trim()
      ? searchClients(clients.map(asCandidate), query, 200)
      : clients
  const real = clients?.filter((client) => !client.isNoClient) ?? []

  return (
    <>
      <div className="flex items-center justify-between gap-3 pr-4">
        <PageTitle>{words.client.plural}</PageTitle>
        {/* Empty, the one action is in the empty state below. */}
        {(!clients || real.length > 0) && <AddClientLink />}
      </div>
      {!clients ? (
        <ListSkeleton />
      ) : real.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={m.clients_empty_title()}
          body={m.clients_empty_body()}
          action={<AddClientLink primary />}
        />
      ) : (
        <>
          <div className="px-4 pb-2 lg:max-w-md lg:pb-3">
            <InputGroup className="lg:bg-card">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                name="search"
                spellCheck={false}
                aria-label={m.clients_search()}
                placeholder={m.clients_search_placeholder()}
                {...searchText}
              />
            </InputGroup>
          </div>
          {!query && (
            <p className="px-4 pb-1 text-sm text-muted-foreground">
              {m.count({ label: words.client.plural, count: real.length })}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground">
              {m.clients_no_match()}
            </p>
          ) : wide ? (
            <ClientsTable
              clients={shown}
              sort={sort}
              onSort={(key, numeric) =>
                setSearch(sortToSearch(nextSort(sort, key, numeric)))
              }
            />
          ) : (
            <ListCard>
              {shown.map((client) => (
                <li key={client._id} className="row-lazy">
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: client._id }}
                    className="flex items-center gap-3 pressable px-4 py-3"
                  >
                    {client.isNoClient ? (
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      >
                        <UserCircleDashedIcon className="size-6" />
                      </span>
                    ) : (
                      <InitialsAvatar name={client.name} />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">
                        {client.isNoClient ? m.no_client() : client.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                        {client.phone && (
                          <span>{formatPhone(client.phone)}</span>
                        )}
                        {client.owedCents > 0 && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <CoinsIcon
                              aria-hidden
                              className="size-4 text-muted-foreground"
                            />
                            {m.clients_owes({
                              amount: formatMoney(client.owedCents),
                            })}
                          </span>
                        )}
                        {client.creditCents > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <PiggyBankIcon
                              aria-hidden
                              className="size-4 text-muted-foreground"
                            />
                            {m.clients_credit({
                              amount: formatMoney(client.creditCents),
                            })}
                          </span>
                        )}
                      </span>
                      <ListExtras target="client" values={client.listExtra} />
                    </span>
                    <CaretRightIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground/60"
                    />
                  </Link>
                </li>
              ))}
            </ListCard>
          )}
        </>
      )}
    </>
  )
}
