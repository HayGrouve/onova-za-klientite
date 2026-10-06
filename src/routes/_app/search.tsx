import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'
import { ListSection } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { formatPhone } from '../../../shared/phone'

export const Route = createFileRoute('/_app/search')({ component: SearchPage })

/** Waits until typing pauses, so each keystroke doesn't run a search. */
function useDebounced(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

function SearchPage() {
  const { business } = useViewer()
  const today = useToday()
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim())
  const results = useQuery(
    api.search.all,
    debounced ? { businessId: business._id, query: debounced } : 'skip',
  )
  const { words } = business
  const empty =
    results &&
    results.clients.length + results.jobs.length + results.items.length === 0

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="px-4">
        <InputGroup>
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            type="search"
            aria-label={m.search_open()}
            placeholder={m.search_placeholder()}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        {!debounced && (
          <p className="pt-2 text-sm text-muted-foreground">
            {m.search_hint()}
          </p>
        )}
      </div>
      {debounced && !results && <ListSkeleton />}
      {empty && (
        <p className="px-4 text-center text-muted-foreground">
          {m.search_none()}
        </p>
      )}
      {results && results.clients.length > 0 && (
        <ListSection title={words.client.plural}>
          {results.clients.map((client) => (
            <li key={client._id}>
              <Link
                to="/clients/$clientId"
                params={{ clientId: client._id }}
                className="flex flex-col rounded-2xl px-4 py-3 hover:bg-muted/60"
              >
                <span className="font-medium">
                  {client.isNoClient ? m.no_client() : client.name}
                </span>
                {client.phone && (
                  <span className="text-sm text-muted-foreground">
                    {formatPhone(client.phone)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ListSection>
      )}
      {results && results.jobs.length > 0 && (
        <ListSection title={words.job.plural}>
          {results.jobs.map((job) => (
            <JobRow key={job._id} job={job} today={today} />
          ))}
        </ListSection>
      )}
      {results && results.items.length > 0 && (
        <ListSection title={words.item.plural}>
          {results.items.map((item) => (
            <li key={item._id}>
              <Link
                to="/items/$itemId"
                params={{ itemId: item._id }}
                className="flex flex-col rounded-2xl px-4 py-3 hover:bg-muted/60"
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {item.clientName}
                </span>
              </Link>
            </li>
          ))}
        </ListSection>
      )}
    </div>
  )
}
