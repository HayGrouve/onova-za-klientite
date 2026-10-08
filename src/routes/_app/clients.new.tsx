import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ClientForm } from '#/components/client-form'
import { ListSkeleton } from '#/components/list-skeleton'
import { PageTitle } from '#/components/page'
import { usePageGuard } from '#/hooks/use-discard-guard'
import { useViewer } from '#/hooks/use-viewer'
import { textParam } from '../../../shared/sort'

type NewClientSearch = { name?: string; phone?: string }

export const Route = createFileRoute('/_app/clients/new')({
  // Search with no results offers a client started from what was typed.
  validateSearch: (search: Record<string, unknown>): NewClientSearch => {
    const name = textParam(search.name)
    const phone = textParam(search.phone)
    return { ...(name && { name }), ...(phone && { phone }) }
  },
  component: NewClientPage,
})

function NewClientPage() {
  const { business } = useViewer()
  const navigate = useNavigate()
  const { name, phone } = Route.useSearch()
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
            initialName={name}
            initialPhone={phone}
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
