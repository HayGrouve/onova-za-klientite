import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ListSkeleton } from '#/components/list-skeleton'
import { PaymentForm } from '#/components/money/payment-form'
import { BottomSheet } from '#/components/bottom-sheet'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { defaultPaymentMethod } from '../../../shared/payment-method'

/**
 * A payment from a client, split over their open jobs, for a screen that
 * lists clients without opening them (Money). It is the client page's form.
 */
export function ClientPaymentSheet({
  client,
  today,
  onClose,
}: {
  client: { _id: Id<'clients'>; name: string } | null
  today: string
  onClose: () => void
}) {
  return (
    <BottomSheet
      open={client !== null}
      onClose={onClose}
      title={m.money_pay({ name: client?.name ?? '' })}
      hideTitle
    >
      <div className="px-4 pb-6">
        {client && (
          <ClientPaymentBody
            // Another client starts with a fresh form.
            key={client._id}
            clientId={client._id}
            name={client.name}
            today={today}
            onClose={onClose}
          />
        )}
      </div>
    </BottomSheet>
  )
}

function ClientPaymentBody({
  clientId,
  name,
  today,
  onClose,
}: {
  clientId: Id<'clients'>
  name: string
  today: string
  onClose: () => void
}) {
  const { business } = useViewer()
  const data = useQuery(api.clients.get, { businessId: business._id, clientId })
  if (!data) return <ListSkeleton />
  return (
    <PaymentForm
      businessId={business._id}
      target={{
        kind: 'client',
        clientId,
        name,
        openJobs: data.jobs.filter((job) => job.owes),
      }}
      today={today}
      depositsOn={business.depositsOnNewJob}
      defaultMethod={defaultPaymentMethod(data.payments)}
      onDone={onClose}
    />
  )
}
