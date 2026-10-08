import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ItemForm } from '#/components/item-form'
import { ListSkeleton } from '#/components/list-skeleton'
import { PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'

export const Route = createFileRoute('/_app/items/new')({
  // `jobId` is set when the item is added from a job: it is linked to that job
  // and the person goes back to it.
  validateSearch: (
    search: Record<string, unknown>,
  ): { clientId: string; jobId?: string } => ({
    clientId: typeof search.clientId === 'string' ? search.clientId : '',
    ...(typeof search.jobId === 'string' ? { jobId: search.jobId } : {}),
  }),
  component: NewItemPage,
})

function NewItemPage() {
  const { business } = useViewer()
  const { clientId, jobId } = Route.useSearch()
  const navigate = useNavigate()
  const fields = useQuery(api.fields.list, {
    businessId: business._id,
    target: 'item',
  })
  return (
    <>
      <PageTitle>{business.words.item.singular}</PageTitle>
      <div className="px-4 pb-6">
        {!fields ? (
          <ListSkeleton />
        ) : (
          <ItemForm
            businessId={business._id}
            clientId={clientId as Id<'clients'>}
            jobId={jobId as Id<'jobs'> | undefined}
            fields={fields}
            onSaved={(itemId) =>
              void (jobId
                ? navigate({
                    to: '/jobs/$jobId',
                    params: { jobId },
                    replace: true,
                  })
                : navigate({
                    to: '/items/$itemId',
                    params: { itemId },
                    replace: true,
                  }))
            }
          />
        )}
      </div>
    </>
  )
}
