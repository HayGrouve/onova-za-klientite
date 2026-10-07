import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import {
  jobBalanceCents,
  jobOwes,
  jobPriceCents,
} from '../../shared/allocation'
import { sumCents } from '../../shared/money'

/**
 * The only writers of cached money (ADR 0008). Call them in the same mutation
 * that changed a source: lines, typed price, allocations, costs, write-off, stage.
 */
export async function computeJobCache(ctx: MutationCtx, job: Doc<'jobs'>) {
  const allocations = await ctx.db
    .query('allocations')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  const costs = await ctx.db
    .query('costs')
    .withIndex('by_job', (q) => q.eq('jobId', job._id))
    .collect()
  const priceCents = jobPriceCents(job.lines, job.typedPriceCents)
  const paidCents = sumCents(
    allocations.map((allocation) => allocation.amountCents),
  )
  const costCents = sumCents(costs.map((cost) => cost.amountCents))
  const balanceCents = jobBalanceCents({
    priceCents,
    paidCents,
    writeOffCents: job.writeOff?.amountCents ?? 0,
  })
  return {
    priceCents,
    paidCents,
    costCents,
    balanceCents,
    owes: jobOwes(balanceCents, job.stageGroup),
  }
}

export async function recomputeJob(ctx: MutationCtx, jobId: Id<'jobs'>) {
  const job = await ctx.db.get('jobs', jobId)
  if (!job) return
  const cache = await computeJobCache(ctx, job)
  const changed = (Object.keys(cache) as Array<keyof typeof cache>).some(
    (key) => job[key] !== cache[key],
  )
  if (changed) await ctx.db.patch('jobs', jobId, cache)
}

export async function computePaymentCache(
  ctx: MutationCtx,
  paymentId: Id<'payments'>,
) {
  const allocations = await ctx.db
    .query('allocations')
    .withIndex('by_payment', (q) => q.eq('paymentId', paymentId))
    .collect()
  return {
    allocatedCents: sumCents(
      allocations.map((allocation) => allocation.amountCents),
    ),
  }
}

export async function recomputePayment(
  ctx: MutationCtx,
  paymentId: Id<'payments'>,
) {
  const payment = await ctx.db.get('payments', paymentId)
  if (!payment) return
  const { allocatedCents } = await computePaymentCache(ctx, paymentId)
  if (payment.allocatedCents !== allocatedCents) {
    await ctx.db.patch('payments', paymentId, { allocatedCents })
  }
}

export async function computeClientCache(
  ctx: MutationCtx,
  clientId: Id<'clients'>,
) {
  const payments = await ctx.db
    .query('payments')
    .withIndex('by_client', (q) => q.eq('clientId', clientId))
    .collect()
  const allocations = await ctx.db
    .query('allocations')
    .withIndex('by_client', (q) => q.eq('clientId', clientId))
    .collect()
  return {
    creditCents:
      sumCents(payments.map((payment) => payment.amountCents)) -
      sumCents(allocations.map((allocation) => allocation.amountCents)),
  }
}

export async function recomputeClient(
  ctx: MutationCtx,
  clientId: Id<'clients'>,
) {
  const client = await ctx.db.get('clients', clientId)
  if (!client) return
  const { creditCents } = await computeClientCache(ctx, clientId)
  if (client.creditCents !== creditCents) {
    await ctx.db.patch('clients', clientId, { creditCents })
  }
}

/** After allocations change: the payment, every touched job and the client. */
export async function recomputeMoney(
  ctx: MutationCtx,
  touched: {
    paymentIds?: Array<Id<'payments'>>
    jobIds?: Array<Id<'jobs'>>
    clientIds?: Array<Id<'clients'>>
  },
) {
  for (const id of new Set(touched.paymentIds)) await recomputePayment(ctx, id)
  for (const id of new Set(touched.jobIds)) await recomputeJob(ctx, id)
  for (const id of new Set(touched.clientIds)) await recomputeClient(ctx, id)
}
