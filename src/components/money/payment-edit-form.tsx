import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { MethodPicker } from '#/components/money/method-picker'
import type { PaymentMethod } from '#/components/money/method-picker'
import { MoneyInput, moneyInputText } from '#/components/money/money-input'
import {
  ReviewAmount,
  ReviewSubmit,
  useReview,
} from '#/components/money/review-submit'
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

export type PaymentData = FunctionReturnType<typeof api.payments.get>

/**
 * Edits a payment. The date, method and label always change. The amount has a
 * floor and, for a refund, a ceiling (`payment.range`), and the form says so
 * in red instead of letting the server refuse it.
 */
export function PaymentEditForm({
  businessId,
  payment,
  onDone,
  onCancel,
}: {
  businessId: Id<'businesses'>
  payment: PaymentData
  onDone: () => void
  onCancel: () => void
}) {
  const update = useMutation(api.payments.update)
  const { busy, run } = useSubmit(onDone)
  const refund = payment.amountCents < 0
  const [amount, setAmount] = useState(
    moneyInputText(Math.abs(payment.amountCents)),
  )
  const [date, setDate] = useState(payment.date)
  const [method, setMethod] = useState<PaymentMethod>(payment.method)
  // A payment has a label (a deposit, say); a refund has a note.
  const [text, setText] = useState(
    (refund ? payment.note : payment.label) ?? '',
  )

  const amountCents = parseMoney(amount)
  const { minCents, maxCents, why } = payment.range
  const tooLow =
    amountCents !== null && amountCents > 0 && amountCents < minCents
  const tooHigh =
    amountCents !== null && maxCents !== null && amountCents > maxCents
  const valid =
    amountCents !== null &&
    amountCents > 0 &&
    !tooLow &&
    !tooHigh &&
    date !== ''
  const several = payment.allocations.length > 1
  // Only a new amount asks first; the date, method and label save directly.
  const amountChanged = amountCents !== Math.abs(payment.amountCents)
  const review = useReview(JSON.stringify([amount, date, method, text]))
  const save = () => {
    if (amountCents === null) return
    void run(() =>
      update({
        businessId,
        paymentId: payment._id,
        amountCents,
        date,
        method,
        label: refund ? payment.label : text || undefined,
        note: refund ? text || undefined : payment.note,
      }),
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        if (amountChanged) review.start()
        else save()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pay-edit-amount">{m.pay_amount()}</FieldLabel>
          <MoneyInput
            id="pay-edit-amount"
            label={m.pay_amount()}
            value={amount}
            onChange={setAmount}
            autoFocus
            invalid={tooLow || tooHigh}
          />
          {tooLow ? (
            <FieldError>
              {why === 'allocated'
                ? m.pay_edit_low_split({ amount: formatMoney(minCents) })
                : m.pay_edit_low({ amount: formatMoney(minCents) })}
            </FieldError>
          ) : tooHigh ? (
            <FieldError>
              {payment.allocations.length > 0
                ? m.refund_over_job({
                    title: payment.allocations[0].title,
                    amount: formatMoney(maxCents),
                  })
                : m.refund_over_credit({ amount: formatMoney(maxCents) })}
            </FieldError>
          ) : (
            several && (
              <FieldDescription>{m.pay_edit_split_kept()}</FieldDescription>
            )
          )}
        </Field>
        <Field>
          <FieldLabel>{m.pay_method()}</FieldLabel>
          <MethodPicker value={method} onChange={setMethod} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="pay-edit-date">{m.pay_date()}</FieldLabel>
            <Input
              id="pay-edit-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-edit-text">
              {refund ? m.pay_note() : m.pay_label()}
            </FieldLabel>
            <Input
              id="pay-edit-text"
              name={refund ? 'note' : 'label'}
              maxLength={refund ? 1000 : 100}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        </div>
      </FieldGroup>
      {review.reviewing ? (
        <ReviewSubmit
          review={review}
          label={m.save()}
          tone={refund ? 'destructive' : 'default'}
          busy={busy}
          onConfirm={save}
          summary={
            <>
              <p>
                {m.review_edit_to()}{' '}
                <ReviewAmount>{formatMoney(amountCents ?? 0)}</ReviewAmount>
              </p>
              <p className="text-muted-foreground">
                {m.review_edit_was({
                  amount: formatMoney(Math.abs(payment.amountCents)),
                })}
              </p>
            </>
          }
        />
      ) : (
        <div className="flex gap-2">
          <Button
            type="submit"
            size="xl"
            className="flex-1"
            disabled={busy || !valid}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {m.save()}
          </Button>
          <Button type="button" size="xl" variant="outline" onClick={onCancel}>
            {m.cancel()}
          </Button>
        </div>
      )}
    </form>
  )
}
