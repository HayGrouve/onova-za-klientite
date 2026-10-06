import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ItemForm } from '#/components/item-form'
import { ListSkeleton } from '#/components/list-skeleton'
import { PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'

export const Route = createFileRoute('/_app/items/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === 'string' ? search.clientId : '',
  }),
  component: NewItemPage,
})

function NewItemPage() {
  const { business } = useViewer()
  const { clientId } = Route.useSearch()
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
            fields={fields}
            onSaved={(itemId) =>
              void navigate({
                to: '/items/$itemId',
                params: { itemId },
                replace: true,
              })
            }
          />
        )}
      </div>
    </>
  )
}
