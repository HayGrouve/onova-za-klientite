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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'
import { formatMoney, parseMoney } from '../../../shared/money'

/**
 * Where a refund can come from (D26): what a job was paid, or, with no job,
 * the client's credit. The limit is what is there to give back.
 */
export type RefundSource = {
  jobId?: Id<'jobs'>
  title?: string
  limitCents: number
}

/** A refund, stored as a negative payment. The client page offers every source; a job offers itself. */
export function RefundForm({
  businessId,
  clientId,
  sources,
  today,
  onDone,
}: {
  businessId: Id<'businesses'>
  clientId: Id<'clients'>
  sources: RefundSource[]
  today: string
  onDone: () => void
}) {
  const refund = useMutation(api.payments.refund)
  const { busy, run } = useSubmit(onDone)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const source = sources[sourceIndex]
  const amountCents = parseMoney(amount)
  const over = amountCents !== null && amountCents > source.limitCents
  const valid = amountCents !== null && amountCents > 0 && !over
  const limit = formatMoney(source.limitCents)
  const title = source.title ?? ''

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
            jobId: source.jobId,
            amountCents,
            date,
            method,
            note: note || undefined,
          }),
        )
      }}
    >
      <FieldGroup>
        {sources.length > 1 && (
          <Field>
            <FieldLabel>{m.refund_source()}</FieldLabel>
            <div
              role="radiogroup"
              aria-label={m.refund_source()}
              className="flex flex-col gap-2"
            >
              {sources.map((item, index) => (
                <Button
                  key={item.jobId ?? 'credit'}
                  type="button"
                  variant="outline"
                  size="xl"
                  role="radio"
                  aria-checked={index === sourceIndex}
                  className="justify-start text-left whitespace-normal aria-checked:border-primary aria-checked:bg-primary/8"
                  onClick={() => setSourceIndex(index)}
                >
                  {item.jobId
                    ? m.refund_source_job({
                        title: item.title ?? '',
                        amount: formatMoney(item.limitCents),
                      })
                    : m.refund_source_credit({
                        amount: formatMoney(item.limitCents),
                      })}
                </Button>
              ))}
            </div>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="refund-amount">{m.pay_amount()}</FieldLabel>
          <MoneyInput
            id="refund-amount"
            label={m.pay_amount()}
            value={amount}
            onChange={setAmount}
            autoFocus
          />
          {over ? (
            <FieldError>
              {source.jobId
                ? m.refund_over_job({ title, amount: limit })
                : m.refund_over_credit({ amount: limit })}
            </FieldError>
          ) : (
            <FieldDescription>
              {source.jobId
                ? m.refund_from_job({ title, amount: limit })
                : m.refund_from_credit({ amount: limit })}
            </FieldDescription>
          )}
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
