import { MagnifyingGlassIcon, PlusIcon, UsersIcon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { EmptyState, PageTitle } from '#/components/page'
import { buttonVariants } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'
import { formatPhone } from '../../../shared/phone-format'
import { searchClients } from '../../../shared/search'

export const Route = createFileRoute('/_app/clients/')({
  component: ClientsPage,
})

function ClientsPage() {
  const { business } = useViewer()
  const clients = useQuery(api.clients.list, { businessId: business._id })
  const [query, setQuery] = useState('')
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
          className={buttonVariants({ variant: 'outline', size: 'xl' })}
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
          <div className="px-4 pb-2">
            <InputGroup>
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
            <p className="px-4 py-6 text-center text-muted-foreground">
              {m.clients_no_match()}
            </p>
          ) : (
            <ul className="flex flex-col">
              {shown.map((client) => (
                <li key={client._id}>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: client._id }}
                    className="flex flex-col gap-0.5 rounded-2xl px-4 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="font-medium">
                      {client.isNoClient ? m.no_client() : client.name}
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      {client.phone && <span>{formatPhone(client.phone)}</span>}
                      {client.owedCents > 0 && (
                        <span className="font-medium text-foreground">
                          {m.clients_owes({
                            amount: formatMoney(client.owedCents),
                          })}
                        </span>
                      )}
                      {client.creditCents > 0 && (
                        <span>
                          {m.clients_credit({
                            amount: formatMoney(client.creditCents),
                          })}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
