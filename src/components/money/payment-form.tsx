import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AnimatedHeight } from '#/components/animated-height'
import { MethodRows } from '#/components/money/method-picker'
import type { PaymentMethod } from '#/components/money/method-picker'
import { MoneyInput } from '#/components/money/money-input'
import {
  PAYMENT_STEPS,
  quickAmounts,
  stepAfter,
  stepBefore,
  stepNumber,
} from '#/components/money/payment-steps'
import type { PaymentStep } from '#/components/money/payment-steps'
import { ReviewSubmit } from '#/components/money/review-submit'
import { useSubmit } from '#/components/money/use-submit'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { formatDayWithDate } from '#/i18n/dates'
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
  | { kind: 'job'; jobId: Id<'jobs'>; title: string; balanceCents: number }
  | {
      kind: 'client'
      clientId: Id<'clients'>
      name: string
      openJobs: OpenJob[]
    }

/** A split row below zero, or above what the job still owes. */
function rowOver(cents: number, balanceCents: number) {
  return cents < 0 || cents > balanceCents
}

const QUESTION: Record<PaymentStep, () => string> = {
  amount: m.pay_step_amount,
  method: m.pay_step_method,
  review: m.pay_step_review,
}

/** One line of the review: what it is on the left, the value beside it. */
const REVIEW_ROW =
  'grid min-h-11 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5'

/**
 * A payment, one question at a time (D117): how much (what is owed, ready to
 * be typed over), how (the method used last), then a review with the date
 * and a note, where the confirm waits a moment so a double tap can't record
 * it. From a job it goes to that job, up to its balance. From a client it is
 * split over their jobs, oldest first, and can be changed (Q8). Any rest is
 * client credit.
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
  const openJobs = useMemo(
    () =>
      target.kind === 'client'
        ? [...target.openJobs].sort((a, b) => a._creationTime - b._creationTime)
        : [],
    [target],
  )
  const owedCents =
    target.kind === 'job'
      ? Math.max(target.balanceCents, 0)
      : sumCents(openJobs.map((job) => job.balanceCents))
  const [step, setStep] = useState<PaymentStep>('amount')
  // Defaults are real values: what is owed, today, the method used last.
  const [amount, setAmount] = useState(
    owedCents > 0 ? moneyInputText(owedCents) : '',
  )
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod)
  const [label, setLabel] = useState('')
  const [tried, setTried] = useState(false)
  const [splitEdits, setSplitEdits] = useState<Record<string, string>>({})

  // Each new step's question takes the focus, so a screen reader reads it
  // and a second Enter or tap lands on nothing. The first step leaves the
  // focus to the sheet, which puts it in the amount.
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (moved.current) heading.current?.focus()
  }, [step])
  const go = (next: PaymentStep) => {
    moved.current = true
    setStep(next)
  }

  const amountCents = parseMoney(amount)
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
      ? Math.max((amountCents ?? 0) - owedCents, 0)
      : (amountCents ?? 0) - allocated
  const splitInvalid =
    target.kind === 'client' &&
    (rest < 0 || split.some((row) => rowOver(row.cents, row.job.balanceCents)))
  const amountMissing = tried && (!amountCents || amountCents <= 0)
  const isDeposit = label === m.deposit_label()

  /** The amount step's "Next": only a valid amount and split go on. */
  const toMethod = (event: React.FormEvent) => {
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
    go(stepAfter('amount'))
  }

  const record = () => {
    if (!amountCents || amountCents <= 0 || splitInvalid) {
      go('amount')
      return
    }
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

  const back = stepBefore(step)
  const description =
    step === 'amount' && owedCents > 0
      ? target.kind === 'job'
        ? m.pay_owed_job({
            title: target.title,
            amount: formatMoney(owedCents),
          })
        : m.pay_owed_client({
            name: target.name,
            amount: formatMoney(owedCents),
          })
      : undefined

  return (
    <div className="flex flex-col gap-3">
      {/* Back on the left, the steps in the middle, the sheet's close
          button on the right, all on one line. */}
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-3 pt-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.back()}
          className={cn(
            'relative -ml-1 after:absolute after:-inset-2.5',
            !back && 'invisible',
          )}
          onClick={() => back && go(back)}
        >
          <CaretLeftIcon />
        </Button>
        <div
          role="img"
          aria-label={m.step_of({
            step: stepNumber(step),
            count: PAYMENT_STEPS.length,
          })}
          className="mx-auto flex w-full max-w-48 gap-1.5"
        >
          {PAYMENT_STEPS.map((each) => (
            <span
              key={each}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none',
                stepNumber(each) <= stepNumber(step)
                  ? 'bg-primary'
                  : 'bg-border',
              )}
            />
          ))}
        </div>
      </div>

      <AnimatedHeight>
        <div
          key={step}
          className="flex animate-in flex-col gap-5 pt-1 duration-200 fade-in"
        >
          <div className="flex flex-col gap-1">
            <h3
              ref={heading}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight outline-none"
            >
              {QUESTION[step]()}
            </h3>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          {step === 'amount' && (
            <form onSubmit={toMethod} className="flex flex-col gap-5">
              <Field>
                <MoneyInput
                  id="pay-amount"
                  label={m.pay_amount()}
                  value={amount}
                  onChange={setAmount}
                  size="lg"
                  selectOnFocus
                  autoFocus
                  invalid={amountMissing}
                  describedBy={amountMissing ? 'pay-amount-error' : undefined}
                />
                {amountMissing && (
                  <FieldError id="pay-amount-error">
                    {m.error_payment_zero()}
                  </FieldError>
                )}
                {quickAmounts(owedCents).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts(owedCents).map((choice) => (
                      <Button
                        key={choice.kind}
                        type="button"
                        variant="outline"
                        aria-pressed={amountCents === choice.cents}
                        className="h-11 rounded-xl aria-pressed:border-primary/40 aria-pressed:bg-accent"
                        onClick={() => setAmount(moneyInputText(choice.cents))}
                      >
                        {choice.kind === 'whole' ? m.pay_whole() : m.pay_half()}
                      </Button>
                    ))}
                  </div>
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
                                setSplitEdits({
                                  ...splitEdits,
                                  [job._id]: value,
                                })
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
                      {rest < 0 && (
                        <FieldError>{m.pay_split_over()}</FieldError>
                      )}
                    </>
                  )}
                </Field>
              )}

              <Button type="submit" size="xl">
                {m.step_next()}
              </Button>
            </form>
          )}

          {step === 'method' && (
            <div className="flex flex-col gap-5">
              <MethodRows
                value={method}
                onPick={(picked) => {
                  setMethod(picked)
                  go(stepAfter('method'))
                }}
              />
              <Button size="xl" onClick={() => go(stepAfter('method'))}>
                {m.step_next()}
              </Button>
            </div>
          )}

          {step === 'review' && (
            <ReviewSubmit
              review={{
                reviewing: true,
                start: () => undefined,
                back: () => go('method'),
              }}
              showBack={false}
              label={m.review_next()}
              confirmLabel={m.review_confirm_pay({
                amount: formatMoney(amountCents ?? 0),
              })}
              busy={busy}
              onConfirm={record}
              summary={
                <div className="flex flex-col divide-y divide-border/70">
                  <button
                    type="button"
                    onClick={() => go('amount')}
                    className={cn(
                      REVIEW_ROW,
                      '-mx-2 rounded-lg pressable px-2 text-left',
                    )}
                  >
                    <span className="text-muted-foreground">
                      {m.pay_amount()}
                    </span>
                    <span className="text-base font-semibold tabular-nums">
                      {formatMoney(amountCents ?? 0)}
                    </span>
                    <CaretRightIcon
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => go('method')}
                    className={cn(
                      REVIEW_ROW,
                      '-mx-2 rounded-lg pressable px-2 text-left',
                    )}
                  >
                    <span className="text-muted-foreground">
                      {m.pay_method()}
                    </span>
                    <span className="text-base">{METHOD_LABEL[method]()}</span>
                    <CaretRightIcon
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                  </button>
                  {/* The date reads as words; the whole row opens the
                      browser's own date picker. */}
                  <label
                    className={cn(
                      REVIEW_ROW,
                      'relative -mx-2 cursor-pointer rounded-lg px-2 transition-colors hover:bg-accent/45 has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                    )}
                  >
                    <span className="text-muted-foreground">
                      {m.pay_date()}
                    </span>
                    <span className="text-base">
                      {formatDayWithDate(date, today)}
                    </span>
                    <CalendarBlankIcon
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                    <input
                      type="date"
                      name="date"
                      required
                      aria-label={m.pay_date()}
                      value={date}
                      onChange={(event) => {
                        // A cleared date keeps the last one: a payment always has a day.
                        if (event.target.value) setDate(event.target.value)
                      }}
                      onClick={(event) => {
                        try {
                          event.currentTarget.showPicker()
                        } catch {
                          // Without showPicker the field still opens on its own.
                        }
                      }}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-2">
                    <label
                      htmlFor="pay-label"
                      className="text-muted-foreground"
                    >
                      {m.pay_note()}
                    </label>
                    <Input
                      id="pay-label"
                      name="label"
                      maxLength={100}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                    {depositsOn && (
                      <Button
                        type="button"
                        variant="outline"
                        aria-pressed={isDeposit}
                        className="col-start-2 h-10 w-fit rounded-xl aria-pressed:border-primary/40 aria-pressed:bg-accent"
                        onClick={() =>
                          setLabel(isDeposit ? '' : m.deposit_label())
                        }
                      >
                        {m.pay_deposit_chip()}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 py-2.5">
                    <span className="text-muted-foreground">{m.pay_for()}</span>
                    <span className="flex flex-col gap-0.5">
                      {target.kind === 'job' &&
                        Math.min(amountCents ?? 0, owedCents) > 0 && (
                          <span>
                            {m.pay_split_to_job({
                              amount: formatMoney(
                                Math.min(amountCents ?? 0, owedCents),
                              ),
                              title: target.title,
                            })}
                          </span>
                        )}
                      {target.kind === 'client' &&
                        split
                          .filter((row) => row.cents > 0)
                          .map((row) => (
                            <span key={row.job._id}>
                              {m.pay_split_to_job({
                                amount: formatMoney(row.cents),
                                title: row.job.title,
                              })}
                            </span>
                          ))}
                      {rest > 0 && (
                        <span>
                          {target.kind === 'client'
                            ? m.pay_split_prepaid({ amount: formatMoney(rest) })
                            : m.pay_rest_credit({ amount: formatMoney(rest) })}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              }
            />
          )}
        </div>
      </AnimatedHeight>
    </div>
  )
}
