import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ClientForm } from '#/components/client-form'
import { ListSkeleton } from '#/components/list-skeleton'
import { PageTitle } from '#/components/page'
import { usePageGuard } from '#/hooks/use-discard-guard'
import { useViewer } from '#/hooks/use-viewer'

export const Route = createFileRoute('/_app/clients/new')({
  component: NewClientPage,
})

function NewClientPage() {
  const { business } = useViewer()
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const guard = usePageGuard(dirty)
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
            onDirtyChange={setDirty}
            onSaved={(clientId) => {
              void guard.releaseWhile(() =>
                navigate({
                  to: '/clients/$clientId',
                  params: { clientId },
                  replace: true,
                }),
              )
            }}
          />
        )}
      </div>
      {guard.prompt}
    </>
  )
}
