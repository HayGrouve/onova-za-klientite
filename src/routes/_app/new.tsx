import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { CenteredMessage } from '#/components/centered-message'
import { NewJobForm } from '#/components/new-job/new-job-form'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/new')({
  // From an item's page: its client is chosen already and the job links to it.
  validateSearch: (
    search: Record<string, unknown>,
  ): { clientId?: string; itemId?: string } => ({
    ...(typeof search.clientId === 'string'
      ? { clientId: search.clientId }
      : {}),
    ...(typeof search.itemId === 'string' ? { itemId: search.itemId } : {}),
  }),
  component: NewJobPage,
})

function NewJobPage() {
  const { business } = useViewer()
  const { clientId, itemId } = Route.useSearch()
  const context = useQuery(api.newJob.context, { businessId: business._id })
  const startItems = useQuery(
    api.items.byClient,
    clientId && itemId
      ? { businessId: business._id, clientId: clientId as Id<'clients'> }
      : 'skip',
  )
  if (!context || (clientId && itemId && !startItems)) {
    return (
      <CenteredMessage>
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">{m.loading()}</span>
      </CenteredMessage>
    )
  }
  // Anything that isn't in this business's lists is ignored: "+" opens blank.
  const client = context.clients.find((item) => item.id === clientId)
  const item = startItems?.find((entry) => entry._id === itemId)
  return (
    <NewJobForm
      key={business._id}
      business={business}
      clients={context.clients}
      services={context.services}
      start={
        client
          ? {
              client: { id: client.id, name: client.name },
              item: item && { id: item._id, name: item.name },
            }
          : undefined
      }
      items={context.items}
    />
  )
}
