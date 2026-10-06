import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { ClientForm } from '#/components/client-form'
import { ListSkeleton } from '#/components/list-skeleton'
import { PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'

export const Route = createFileRoute('/_app/clients/new')({
  component: NewClientPage,
})

function NewClientPage() {
  const { business } = useViewer()
  const navigate = useNavigate()
  const fields = useQuery(api.fields.list, {
    businessId: business._id,
    target: 'client',
  })
  return (
    <>
      <PageTitle>{business.words.client.singular}</PageTitle>
      <div className="px-4 pb-6">
        {!fields ? (
          <ListSkeleton />
        ) : (
          <ClientForm
            businessId={business._id}
            fields={fields}
            onSaved={(clientId) =>
              void navigate({
                to: '/clients/$clientId',
                params: { clientId },
                replace: true,
              })
            }
          />
        )}
      </div>
    </>
  )
}
