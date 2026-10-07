import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { MethodPicker } from '#/components/money/method-picker'
import type { PaymentMethod } from '#/components/money/method-picker'
import { MoneyInput } from '#/components/money/money-input'
import { useSubmit } from '#/components/money/use-submit'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'
import { formatMoney, parseMoney } from '../../../shared/money'

/** A refund: from what a job was paid, or from client credit (D26). Stored as a negative payment. */
export function RefundForm({
  businessId,
  clientId,
  job,
  creditCents,
  today,
  onDone,
}: {
  businessId: Id<'businesses'>
  clientId: Id<'clients'>
  job?: { _id: Id<'jobs'>; paidCents: number }
  creditCents: number
  today: string
  onDone: () => void
}) {
  const refund = useMutation(api.payments.refund)
  const { busy, run } = useSubmit(onDone)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const limit = job ? job.paidCents : creditCents
  const amountCents = parseMoney(amount)
  const valid = amountCents !== null && amountCents > 0 && amountCents <= limit

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        void run(() =>
          refund({
            businessId,
            clientId,
            jobId: job?._id,
            amountCents,
            date,
            method,
            note: note || undefined,
          }),
        )
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="refund-amount">{m.pay_amount()}</FieldLabel>
          <MoneyInput
            id="refund-amount"
            label={m.pay_amount()}
            value={amount}
            onChange={setAmount}
            autoFocus
          />
          <FieldDescription>
            {job
              ? m.refund_from_job({ amount: formatMoney(limit) })
              : m.refund_from_credit({ amount: formatMoney(limit) })}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{m.pay_method()}</FieldLabel>
          <MethodPicker value={method} onChange={setMethod} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="refund-date">{m.pay_date()}</FieldLabel>
            <Input
              id="refund-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="refund-note">{m.pay_note()}</FieldLabel>
            <Input
              id="refund-note"
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>
      </FieldGroup>
      <Button
        type="submit"
        size="xl"
        variant="destructive"
        disabled={busy || !valid}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {m.refund_save()}
      </Button>
    </form>
  )
}
