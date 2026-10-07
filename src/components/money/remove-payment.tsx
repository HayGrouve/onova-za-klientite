import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useSubmit } from '#/components/money/use-submit'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'

/** Deletes a payment entered by mistake, with all its allocations. */
export function RemovePayment({
  businessId,
  paymentId,
  amountCents,
  onDone,
}: {
  businessId: Id<'businesses'>
  paymentId: Id<'payments'>
  amountCents: number
  onDone: () => void
}) {
  const remove = useMutation(api.payments.remove)
  const { busy, run } = useSubmit(onDone)
  return (
    <div className="flex flex-col gap-4">
      <p>
        {m.pay_remove_confirm()}{' '}
        <span className="font-semibold">{formatMoney(amountCents)}</span>
      </p>
      <div className="flex gap-2">
        <Button
          size="xl"
          variant="destructive"
          className="flex-1"
          disabled={busy}
          onClick={() =>
            void run(() => remove({ businessId, paymentId }), m.pay_removed())
          }
        >
          {busy && <Spinner data-icon="inline-start" />}
          {m.pay_remove()}
        </Button>
        <Button size="xl" variant="outline" onClick={onDone}>
          {m.cancel()}
        </Button>
      </div>
    </div>
  )
}
