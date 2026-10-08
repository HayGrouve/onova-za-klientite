import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ListSkeleton } from '#/components/list-skeleton'
import { PaymentEditForm } from '#/components/money/payment-edit-form'
import type { PaymentData } from '#/components/money/payment-edit-form'
import { RemovePayment } from '#/components/money/remove-payment'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'

/**
 * A payment row opens this: what was paid and how it was split, with Edit and
 * Delete for a manager. The sheet lives outside the page's other sheets, so
 * a page only keeps the id of the payment that is open.
 */
export function PaymentSheet({
  businessId,
  paymentId,
  today,
  onClose,
}: {
  businessId: Id<'businesses'>
  paymentId: Id<'payments'> | null
  today: string
  onClose: () => void
}) {
  return (
    <Sheet
      open={paymentId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
      >
        {paymentId && (
          <PaymentSheetBody
            // A new payment starts again on its own view.
            key={paymentId}
            businessId={businessId}
            paymentId={paymentId}
            today={today}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

type Mode = 'view' | 'edit' | 'remove'

function PaymentSheetBody({
  businessId,
  paymentId,
  today,
  onClose,
}: {
  businessId: Id<'businesses'>
  paymentId: Id<'payments'>
  today: string
  onClose: () => void
}) {
  const { business, businesses } = useViewer()
  const role = businesses.find((item) => item._id === business._id)?.role
  const [mode, setMode] = useState<Mode>('view')
  // Once it is deleted the payment is gone, and asking for it again would fail.
  const [kept, setKept] = useState<PaymentData>()
  const live = useQuery(
    api.payments.get,
    mode === 'remove' ? 'skip' : { businessId, paymentId },
  )
  const payment = mode === 'remove' ? kept : live

  if (!payment) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>{m.pay_title()}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ListSkeleton />
        </div>
      </>
    )
  }
  const refund = payment.amountCents < 0
  const title =
    mode === 'remove'
      ? refund
        ? m.refund_remove()
        : m.pay_remove()
      : refund
        ? m.refund_title()
        : m.pay_title()

  return (
    <>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>
      <div className="px-4 pb-6">
        {mode === 'edit' ? (
          <PaymentEditForm
            businessId={businessId}
            payment={payment}
            onDone={onClose}
            onCancel={() => setMode('view')}
          />
        ) : mode === 'remove' ? (
          <RemovePayment
            businessId={businessId}
            paymentId={payment._id}
            amountCents={payment.amountCents}
            onDone={onClose}
            onCancel={() => setMode('view')}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(payment.amountCents)}
            </p>
            <dl className="flex flex-col divide-y divide-border/70 overflow-hidden surface text-sm">
              <DetailRow label={m.pay_date()}>
                {formatDay(payment.date, today)}
              </DetailRow>
              <DetailRow label={m.pay_method()}>
                {METHOD_LABEL[payment.method]()}
              </DetailRow>
              {(payment.label ?? payment.note) && (
                <DetailRow label={m.pay_note()}>
                  {[payment.label, payment.note].filter(Boolean).join(' · ')}
                </DetailRow>
              )}
            </dl>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {m.pay_sheet_split()}
              </h3>
              <Split payment={payment} />
            </section>
            {(role === 'owner' || role === 'manager') && (
              <div className="flex gap-2">
                <Button
                  size="xl"
                  className="flex-1"
                  onClick={() => setMode('edit')}
                >
                  {m.edit()}
                </Button>
                <Button
                  size="xl"
                  variant="destructive"
                  onClick={() => {
                    setKept(payment)
                    setMode('remove')
                  }}
                >
                  {refund ? m.refund_remove() : m.pay_remove()}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  )
}

/** The split, one part per line: what went to each job, then what stayed prepaid. */
function Split({ payment }: { payment: PaymentData }) {
  const refund = payment.amountCents < 0
  return (
    <ul className="flex flex-col gap-1.5">
      {payment.allocations.map((allocation) => (
        <li key={allocation.jobId} className="text-base">
          {refund
            ? m.refund_split_from_job({
                amount: formatMoney(Math.abs(allocation.amountCents)),
                title: allocation.title,
              })
            : m.pay_split_to_job({
                amount: formatMoney(allocation.amountCents),
                title: allocation.title,
              })}
        </li>
      ))}
      {/* Prepaid money is shown when there is some, and when nothing else is. */}
      {(payment.prepaidCents > 0 || payment.allocations.length === 0) && (
        <li className="text-base">
          {refund
            ? m.refund_split_from_credit({
                amount: formatMoney(payment.prepaidCents),
              })
            : m.pay_split_prepaid({
                amount: formatMoney(payment.prepaidCents),
              })}
        </li>
      )}
    </ul>
  )
}
