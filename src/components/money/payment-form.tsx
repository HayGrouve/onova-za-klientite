import { useMutation } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { MethodPicker } from '#/components/money/method-picker'
import type { PaymentMethod } from '#/components/money/method-picker'
import { MoneyInput } from '#/components/money/money-input'
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
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'
import { splitPayment } from '../../../shared/allocation'
import {
  formatMoney,
  moneyInputText,
  parseMoney,
  sumCents,
} from '../../../shared/money'

export type OpenJob = {
  _id: Id<'jobs'>
  title: string
  balanceCents: number
  _creationTime: number
}

type Target =
  | { kind: 'job'; jobId: Id<'jobs'>; balanceCents: number }
  | { kind: 'client'; clientId: Id<'clients'>; openJobs: OpenJob[] }

/** A split row below zero, or above what the job still owes. */
function rowOver(cents: number, balanceCents: number) {
  return cents < 0 || cents > balanceCents
}

/**
 * A payment. From a job it goes to that job, up to its balance. From a client
 * it is split over their jobs, oldest first, and can be changed (Q8). Any
 * rest is client credit.
 */
export function PaymentForm({
  businessId,
  target,
  today,
  depositsOn,
  defaultMethod = 'cash',
  onDone,
}: {
  businessId: Id<'businesses'>
  target: Target
  today: string
  depositsOn: boolean
  /** The method the client paid with last time; cash when they haven't paid yet (D37). */
  defaultMethod?: PaymentMethod
  onDone: () => void
}) {
  const fromJob = useMutation(api.payments.addFromJob)
  const fromClient = useMutation(api.payments.addFromClient)
  const { busy, run } = useSubmit(onDone)
  const [amount, setAmount] = useState(
    target.kind === 'job' && target.balanceCents > 0
      ? moneyInputText(target.balanceCents)
      : '',
  )
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod)
  const [label, setLabel] = useState('')
  const [tried, setTried] = useState(false)
  const [splitEdits, setSplitEdits] = useState<Record<string, string>>({})

  const amountCents = parseMoney(amount)
  const openJobs = useMemo(
    () =>
      target.kind === 'client'
        ? [...target.openJobs].sort((a, b) => a._creationTime - b._creationTime)
        : [],
    [target],
  )
  const autoSplit = useMemo(() => {
    if (target.kind !== 'client' || !amountCents || amountCents <= 0)
      return new Map<string, number>()
    const { allocations } = splitPayment(
      amountCents,
      openJobs.map((job) => ({
        jobId: job._id,
        balanceCents: job.balanceCents,
      })),
    )
    return new Map(
      allocations.map((allocation) => [
        allocation.jobId,
        allocation.amountCents,
      ]),
    )
  }, [target.kind, amountCents, openJobs])
  const split = openJobs.map((job) => {
    const edited = splitEdits[job._id] as string | undefined
    const cents =
      edited === undefined
        ? (autoSplit.get(job._id) ?? 0)
        : (parseMoney(edited) ?? 0)
    return {
      job,
      cents,
      text: edited ?? moneyInputText(autoSplit.get(job._id) ?? 0),
    }
  })
  const allocated = sumCents(split.map((row) => row.cents))
  const rest =
    target.kind === 'job'
      ? Math.max((amountCents ?? 0) - Math.max(target.balanceCents, 0), 0)
      : (amountCents ?? 0) - allocated
  const splitInvalid =
    target.kind === 'client' &&
    (rest < 0 || split.some((row) => rowOver(row.cents, row.job.balanceCents)))

  const amountMissing = tried && (!amountCents || amountCents <= 0)
  // Any edit ends the review, so what is confirmed is what is recorded.
  const review = useReview(
    JSON.stringify([amount, date, method, label, splitEdits]),
  )

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!amountCents || amountCents <= 0) {
      setTried(true)
      document.getElementById('pay-amount')?.focus()
      return
    }
    if (splitInvalid) {
      setTried(true)
      const bad = split.find((row) => rowOver(row.cents, row.job.balanceCents))
      document
        .getElementById(bad ? `pay-split-${bad.job._id}` : 'pay-amount')
        ?.focus()
      return
    }
    review.start()
  }

  const record = () => {
    if (!amountCents) return
    const common = {
      businessId,
      amountCents,
      date,
      method,
      label: label || undefined,
    }
    void run(
      () =>
        target.kind === 'job'
          ? fromJob({ ...common, jobId: target.jobId })
          : fromClient({
              ...common,
              clientId: target.clientId,
              allocations: split
                .filter((row) => row.cents > 0)
                .map((row) => ({ jobId: row.job._id, amountCents: row.cents })),
            }),
      m.toast_pay_added({ amount: formatMoney(amountCents) }),
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pay-amount">{m.pay_amount()}</FieldLabel>
          <MoneyInput
            id="pay-amount"
            label={m.pay_amount()}
            value={amount}
            onChange={setAmount}
            autoFocus
            invalid={amountMissing}
            describedBy={amountMissing ? 'pay-amount-error' : undefined}
          />
          {amountMissing && (
            <FieldError id="pay-amount-error">
              {m.error_payment_zero()}
            </FieldError>
          )}
          <div aria-live="polite" className="empty:hidden">
            {rest > 0 && (
              <FieldDescription>
                {m.pay_rest_credit({ amount: formatMoney(rest) })}
              </FieldDescription>
            )}
          </div>
        </Field>

        {target.kind === 'client' && (
          <Field>
            <FieldLabel>{m.pay_split_title()}</FieldLabel>
            {openJobs.length === 0 ? (
              <FieldDescription>{m.pay_no_open_jobs()}</FieldDescription>
            ) : (
              <>
                <FieldDescription>{m.pay_split_hint()}</FieldDescription>
                <div className="flex flex-col gap-2">
                  {split.map(({ job, text, cents }) => (
                    <div
                      key={job._id}
                      className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{job.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.balance_short({
                            amount: formatMoney(job.balanceCents),
                          })}
                        </span>
                      </span>
                      <MoneyInput
                        id={`pay-split-${job._id}`}
                        name={`split-${job._id}`}
                        label={job.title}
                        value={text}
                        invalid={rowOver(cents, job.balanceCents)}
                        describedBy={
                          rowOver(cents, job.balanceCents)
                            ? `pay-split-${job._id}-error`
                            : undefined
                        }
                        onChange={(value) =>
                          setSplitEdits({ ...splitEdits, [job._id]: value })
                        }
                      />
                      {rowOver(cents, job.balanceCents) && (
                        <FieldError
                          id={`pay-split-${job._id}-error`}
                          className="col-span-2"
                        >
                          {m.pay_split_row_over()}
                        </FieldError>
                      )}
                    </div>
                  ))}
                </div>
                {rest < 0 && <FieldError>{m.pay_split_over()}</FieldError>}
              </>
            )}
          </Field>
        )}

        <Field>
          <FieldLabel>{m.pay_method()}</FieldLabel>
          <MethodPicker value={method} onChange={setMethod} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="pay-date">{m.pay_date()}</FieldLabel>
            <Input
              id="pay-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-label">{m.pay_label()}</FieldLabel>
            <Input
              id="pay-label"
              name="label"
              maxLength={100}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        </div>
        {depositsOn && !label && (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-fit rounded-xl"
            onClick={() => setLabel(m.deposit_label())}
          >
            {m.pay_deposit_chip()}
          </Button>
        )}
      </FieldGroup>
      <ReviewSubmit
        review={review}
        label={m.review_next()}
        confirmLabel={m.review_confirm_pay({
          amount: formatMoney(amountCents ?? 0),
        })}
        busy={busy}
        onConfirm={record}
        summary={
          <>
            <p>
              {m.review_pay()}{' '}
              <ReviewAmount>{formatMoney(amountCents ?? 0)}</ReviewAmount>
            </p>
            <p className="text-muted-foreground">
              {METHOD_LABEL[method]()} · {formatDay(date, today)}
            </p>
            {target.kind === 'client' &&
              split
                .filter((row) => row.cents > 0)
                .map((row) => (
                  <p key={row.job._id}>
                    {m.pay_split_to_job({
                      amount: formatMoney(row.cents),
                      title: row.job.title,
                    })}
                  </p>
                ))}
            {target.kind === 'client' && rest > 0 && (
              <p>{m.pay_split_prepaid({ amount: formatMoney(rest) })}</p>
            )}
            {target.kind === 'job' && rest > 0 && (
              <p>{m.pay_rest_credit({ amount: formatMoney(rest) })}</p>
            )}
          </>
        }
      />
    </form>
  )
}
