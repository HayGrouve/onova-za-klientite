import { sumCents } from './money'

/**
 * Changing the amount of a payment that is already recorded (ADR 0008).
 * Everything is a magnitude: a refund is a negative payment, and its sign
 * never changes, so it is kept out of these numbers.
 */

export type EditJob<TId extends string> = {
  jobId: TId
  /** What this payment puts on the job now. */
  allocatedCents: number
  /** The job's paid total now: every payment and refund on it. */
  paidCents: number
  /** What the job could still take: its balance while it owes, else 0. */
  roomCents: number
}

export type PaymentEditState<TId extends string> = {
  kind: 'payment' | 'refund'
  amountCents: number
  /** The jobs the payment sits on, one entry per job. */
  jobs: Array<EditJob<TId>>
  /** The client's credit now, this payment's prepaid part included. */
  clientCreditCents: number
}

export type AmountRange = {
  minCents: number
  maxCents: number | null
  /** Why the minimum is above 1: money already returned or used, or a split. */
  why: 'none' | 'refunded' | 'allocated'
}

type Allocation<TId extends string> = { jobId: TId; amountCents: number }

/**
 * The part of a payment that is on no job: for a payment it is the client
 * credit it left, for a refund without a job it is the credit paid back.
 */
export function paymentPrepaidCents<TId extends string>(
  state: PaymentEditState<TId>,
): number {
  if (state.kind === 'refund')
    return state.jobs.length > 0 ? 0 : state.amountCents
  return Math.max(
    state.amountCents - sumCents(state.jobs.map((job) => job.allocatedCents)),
    0,
  )
}

/**
 * The amounts an edit may use. Under the minimum, a job's paid total or the
 * client's credit would drop below zero because of money already refunded or
 * used (D26). A refund may grow only up to what it can still take back. A
 * payment over several jobs keeps its split, so it can't go under the split.
 */
export function paymentAmountRange<TId extends string>(
  state: PaymentEditState<TId>,
): AmountRange {
  const { amountCents, jobs } = state
  // A credit that is already negative may not get worse, but is not blamed on this edit.
  const credit = Math.max(state.clientCreditCents, 0)

  if (state.kind === 'refund') {
    if (jobs.length > 1) {
      return { minCents: amountCents, maxCents: amountCents, why: 'none' }
    }
    const takeBack = jobs.length === 1 ? Math.max(jobs[0].paidCents, 0) : credit
    return { minCents: 1, maxCents: amountCents + takeBack, why: 'none' }
  }

  const allocated = sumCents(jobs.map((job) => job.allocatedCents))
  const prepaid = Math.max(amountCents - allocated, 0)
  // The prepaid part can shrink only as far as the client still holds credit.
  const lowestPrepaid = Math.max(prepaid - credit, 0)

  let minCents: number
  let why: AmountRange['why'] = 'none'
  if (jobs.length > 1) {
    minCents = allocated + lowestPrepaid
    why = lowestPrepaid > 0 ? 'refunded' : 'allocated'
  } else {
    const paid = Math.max(jobs[0]?.paidCents ?? 0, 0)
    // The job's part can shrink only as far as the job's other payments allow.
    const lowestJob = Math.max(allocated - paid, 0)
    minCents = lowestPrepaid > 0 ? allocated + lowestPrepaid : lowestJob
  }
  if (minCents > 1 && why === 'none') why = 'refunded'
  return { minCents: Math.max(minCents, 1), maxCents: null, why }
}

/**
 * Where the money of an edited payment goes, with no checks (see
 * `planPaymentEdit`).
 * - A payment over several jobs keeps its split.
 * - A decrease comes off the prepaid part first, then off the job.
 * - An increase follows the payment: if all of it was on the job, the extra
 *   goes there too, up to what the job owes, and the rest is prepaid. If some
 *   was prepaid, the extra is prepaid: credit is never applied on its own (Q8).
 * - A refund always sits fully on its job, or fully on credit.
 */
export function reallocate<TId extends string>(
  state: PaymentEditState<TId>,
  newAmountCents: number,
): Array<Allocation<TId>> {
  const { jobs, amountCents } = state
  const unchanged = jobs.map((job) => ({
    jobId: job.jobId,
    amountCents: job.allocatedCents,
  }))
  if (jobs.length !== 1) return unchanged
  const job = jobs[0]

  if (state.kind === 'refund') {
    return [{ jobId: job.jobId, amountCents: newAmountCents }]
  }
  let onJob = job.allocatedCents
  if (newAmountCents <= amountCents) {
    onJob = Math.min(onJob, newAmountCents)
  } else if (job.allocatedCents === amountCents) {
    onJob += Math.min(newAmountCents - amountCents, job.roomCents)
  }
  return [{ jobId: job.jobId, amountCents: onJob }]
}

export type PaymentEditPlan<TId extends string> =
  | {
      ok: true
      allocations: Array<Allocation<TId>>
      /** The part of the new amount that is not on any job: client credit. */
      prepaidCents: number
    }
  | { ok: false; reason: 'tooLow' | 'tooHigh'; limitCents: number }

export function planPaymentEdit<TId extends string>(
  state: PaymentEditState<TId>,
  newAmountCents: number,
): PaymentEditPlan<TId> {
  const range = paymentAmountRange(state)
  if (newAmountCents < range.minCents) {
    return { ok: false, reason: 'tooLow', limitCents: range.minCents }
  }
  if (range.maxCents !== null && newAmountCents > range.maxCents) {
    return { ok: false, reason: 'tooHigh', limitCents: range.maxCents }
  }
  const allocations = reallocate(state, newAmountCents).filter(
    (allocation) => allocation.amountCents > 0,
  )
  return {
    ok: true,
    allocations,
    prepaidCents:
      newAmountCents - sumCents(allocations.map((a) => a.amountCents)),
  }
}
