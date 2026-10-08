import { lineTotalCents, sumCents } from './money'
import type { StageGroup } from './stages'

export type Line = { quantity: number; unitPriceCents: number }

export function jobPriceCents(lines: Line[], typedPriceCents?: number): number {
  if (lines.length === 0) return typedPriceCents ?? 0
  return sumCents(
    lines.map((line) => lineTotalCents(line.quantity, line.unitPriceCents)),
  )
}

export function jobBalanceCents(a: {
  priceCents: number
  paidCents: number
  writeOffCents: number
}): number {
  return a.priceCents - a.paidCents - a.writeOffCents
}

/** Paid minus costs (design doc); it is not stored. */
export function jobProfitCents(a: {
  paidCents: number
  costCents: number
}): number {
  return a.paidCents - a.costCents
}

/**
 * Whether a job's profit is the final figure. New and in-progress work can
 * still be paid or cost more, so its profit is only "so far"; a done job's
 * profit is settled, and a cancelled one has nothing more coming either.
 */
export function jobProfitIsFinal(group: StageGroup): boolean {
  return group === 'done' || group === 'cancelled'
}

/** A job owes a positive balance, unless it is cancelled. */
export function jobOwes(balanceCents: number, group: StageGroup): boolean {
  return balanceCents > 0 && group !== 'cancelled'
}

/** What a job still owes: its balance when it owes, else nothing. */
export function jobOwedCents(job: {
  owes: boolean
  balanceCents: number
}): number {
  return job.owes ? job.balanceCents : 0
}

/** Fills the open jobs in the given order (oldest first). The rest is credit. */
export function splitPayment<TId extends string>(
  amountCents: number,
  openJobs: Array<{ jobId: TId; balanceCents: number }>,
): {
  allocations: Array<{ jobId: TId; amountCents: number }>
  creditCents: number
} {
  if (!(amountCents > 0)) {
    throw new Error('splitPayment needs a positive amount')
  }
  const allocations: Array<{ jobId: TId; amountCents: number }> = []
  let left = amountCents
  for (const job of openJobs) {
    if (left === 0) break
    if (job.balanceCents <= 0) continue
    const take = Math.min(left, job.balanceCents)
    allocations.push({ jobId: job.jobId, amountCents: take })
    left -= take
  }
  return { allocations, creditCents: left }
}

export function checkAllocations(
  paymentCents: number,
  allocations: Array<{ amountCents: number }>,
): 'ok' | 'signMismatch' | 'exceedsPayment' | 'zero' {
  if (allocations.some((a) => a.amountCents === 0)) return 'zero'
  const sign = Math.sign(paymentCents)
  if (allocations.some((a) => Math.sign(a.amountCents) !== sign)) {
    return 'signMismatch'
  }
  const total = sumCents(allocations.map((a) => Math.abs(a.amountCents)))
  return total > Math.abs(paymentCents) ? 'exceedsPayment' : 'ok'
}
