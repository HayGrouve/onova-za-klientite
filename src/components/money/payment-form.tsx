import { useMutation } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { MethodPicker } from '#/components/money/method-picker'
import type { PaymentMethod } from '#/components/money/method-picker'
import { MoneyInput, moneyInputText } from '#/components/money/money-input'
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
import { splitPayment } from '../../../shared/allocation'
import { formatMoney, parseMoney, sumCents } from '../../../shared/money'

export type OpenJob = {
  _id: Id<'jobs'>
  title: string
  balanceCents: number
  _creationTime: number
}

type Target =
  | { kind: 'job'; jobId: Id<'jobs'>; balanceCents: number }
  | { kind: 'client'; clientId: Id<'clients'>; openJobs: OpenJob[] }

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
    (rest < 0 ||
      split.some((row) => row.cents < 0 || row.cents > row.job.balanceCents))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!amountCents || amountCents <= 0 || splitInvalid) return
    const common = {
      businessId,
      amountCents,
      date,
      method,
      label: label || undefined,
    }
    void run(() =>
      target.kind === 'job'
        ? fromJob({ ...common, jobId: target.jobId })
        : fromClient({
            ...common,
            clientId: target.clientId,
            allocations: split
              .filter((row) => row.cents > 0)
              .map((row) => ({ jobId: row.job._id, amountCents: row.cents })),
          }),
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
          />
          {rest > 0 && (
            <FieldDescription>
              {m.pay_rest_credit({ amount: formatMoney(rest) })}
            </FieldDescription>
          )}
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
                  {split.map(({ job, text }) => (
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
                        label={job.title}
                        value={text}
                        onChange={(value) =>
                          setSplitEdits({ ...splitEdits, [job._id]: value })
                        }
                      />
                    </div>
                  ))}
                </div>
                {rest < 0 && (
                  <p className="text-sm text-destructive">
                    {m.pay_split_over()}
                  </p>
                )}
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
      <Button
        type="submit"
        size="xl"
        disabled={busy || !amountCents || amountCents <= 0 || splitInvalid}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {m.pay_save()}
      </Button>
    </form>
  )
}
