import {
  CaretRightIcon,
  CoinsIcon,
  MagnifyingGlassIcon,
  PiggyBankIcon,
  PlusIcon,
  UserCircleDashedIcon,
  UsersIcon,
} from '@phosphor-icons/react'
import { cn } from 'cn'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ClientsTable } from '#/components/clients-table'
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
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'
import { formatPhone } from '../../../shared/phone-format'
import { searchClients } from '../../../shared/search'

export const Route = createFileRoute('/_app/clients/')({
  staticData: { layout: 'wide' },
  component: ClientsPage,
})

function ClientsPage() {
  const { business } = useViewer()
  const clients = useQuery(api.clients.list, { businessId: business._id })
  const [query, setQuery] = useState('')
  const wide = useWide()
  const { words } = business

  const shown = !clients
    ? []
    : query.trim()
      ? searchClients(
          clients.map((client) => ({
            ...client,
            id: client._id,
            phones: client.phone ? [client.phone] : [],
          })),
          query,
          200,
        )
      : clients
  const real = clients?.filter((client) => !client.isNoClient) ?? []

  return (
    <>
      <div className="flex items-center justify-between gap-3 pr-4">
        <PageTitle>{words.client.plural}</PageTitle>
        <Link
          to="/clients/new"
          className={cn(
            buttonVariants({
              variant: 'outline',
              size: 'xl',
              className: 'shadow-xs',
            }),
          )}
        >
          <PlusIcon data-icon="inline-start" />
          {m.clients_add()}
        </Link>
      </div>
      {!clients ? (
        <ListSkeleton />
      ) : real.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={m.clients_empty_title({ clients: words.client.plural })}
          body={m.clients_empty_body()}
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
                aria-label={m.clients_search()}
                placeholder={m.clients_search()}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>
          </div>
          {!query && (
            <p className="px-4 pb-1 text-sm text-muted-foreground">
              {m.count({ label: words.client.plural, count: real.length })}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="animate-rise px-4 py-6 text-center text-muted-foreground">
              {m.clients_no_match()}
            </p>
          ) : wide ? (
            <ClientsTable clients={shown} />
          ) : (
            <ListCard>
              {shown.map((client) => (
                <li key={client._id}>
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
