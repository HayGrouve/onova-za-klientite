import type { WithoutSystemFields } from 'convex/server'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { creditForJob, jobOwedCents } from '../../shared/allocation'
import type { BusinessMutationCtx } from './auth'
import { fail } from './errors'
import { recomputeClient, recomputeJob, recomputeMoney } from './recompute'

/**
 * The ledger: every write to payments, allocations and costs, and to the job
 * fields money is computed from, goes through here. Each call refreshes the
 * caches it touched in the same mutation (ADR 0008), so no mutation calls
 * recompute or lists what it touched. ESLint keeps the raw writes in here.
 */

type CacheField =
  'priceCents' | 'paidCents' | 'costCents' | 'balanceCents' | 'owes'

/** A job as written: everything but the cached money, which the ledger computes. */
export type JobFields = Omit<WithoutSystemFields<Doc<'jobs'>>, CacheField>

export type JobPatch = Partial<Omit<JobFields, 'businessId'>>

/** A payment's own fields, already checked. `amountCents` is negative for a refund. */
export type PaymentFields = {
  amountCents: number
  date: string
  method: Doc<'payments'>['method']
  label?: string
  note?: string
}

type Allocation = { jobId: Id<'jobs'>; amountCents: number }

export async function insertJob(ctx: MutationCtx, job: JobFields) {
  const jobId = await ctx.db.insert('jobs', {
    ...job,
    priceCents: 0,
    paidCents: 0,
    costCents: 0,
    balanceCents: 0,
    owes: false,
  })
  await recomputeJob(ctx, jobId)
  return jobId
}

/** Changes a job. Lines, typed price, write-off and stage group feed its money. */
export async function patchJob(
  ctx: MutationCtx,
  jobId: Id<'jobs'>,
  patch: JobPatch,
) {
  await ctx.db.patch('jobs', jobId, patch)
  await recomputeJob(ctx, jobId)
}

async function insertAllocations(
  ctx: BusinessMutationCtx,
  paymentId: Id<'payments'>,
  clientId: Id<'clients'>,
  allocations: Allocation[],
) {
  for (const allocation of allocations) {
    await ctx.db.insert('allocations', {
      businessId: ctx.business._id,
      paymentId,
      jobId: allocation.jobId,
      clientId,
      amountCents: allocation.amountCents,
    })
  }
}

/**
 * Records money from (or, negative, back to) a client, split across their
 * jobs as given. What isn't allocated is client credit.
 */
export async function recordPayment(
  ctx: BusinessMutationCtx,
  clientId: Id<'clients'>,
  fields: PaymentFields,
  allocations: Allocation[] = [],
) {
  const paymentId = await ctx.db.insert('payments', {
    businessId: ctx.business._id,
    clientId,
    ...fields,
    allocatedCents: 0,
    createdBy: ctx.member._id,
  })
  await insertAllocations(ctx, paymentId, clientId, allocations)
  await recomputeMoney(ctx, {
    paymentIds: [paymentId],
    jobIds: allocations.map((allocation) => allocation.jobId),
    clientIds: [clientId],
  })
  return paymentId
}

/**
 * A payment taken on a job: it goes to the job, up to what the job owes, and
 * any rest is client credit. Returns the payment.
 */
export async function payJob(
  ctx: BusinessMutationCtx,
  jobId: Id<'jobs'>,
  fields: PaymentFields,
) {
  const job = (await ctx.db.get('jobs', jobId))!
  const toJob = Math.min(fields.amountCents, Math.max(jobOwedCents(job), 0))
  return await recordPayment(
    ctx,
    job.clientId,
    fields,
    toJob > 0 ? [{ jobId, amountCents: toJob }] : [],
  )
}

/**
 * Moves `amountCents` of the client's credit onto one of their jobs, from
 * their payments oldest first. Fails with `credit.notEnough` when the job
 * doesn't owe that much or the credit can't cover it (credit sitting behind a
 * refund that pays it back isn't spendable).
 */
export async function spendCredit(
  ctx: BusinessMutationCtx,
  jobId: Id<'jobs'>,
  amountCents: number,
) {
  const job = (await ctx.db.get('jobs', jobId))!
  const client = (await ctx.db.get('clients', job.clientId))!
  if (amountCents <= 0 || amountCents > creditForJob(client.creditCents, job)) {
    fail('credit.notEnough')
  }
  const payments = await ctx.db
    .query('payments')
    .withIndex('by_client', (q) => q.eq('clientId', client._id))
    .collect()
  let left = amountCents
  const touched: Array<Id<'payments'>> = []
  for (const payment of payments) {
    if (left === 0) break
    const free = payment.amountCents - payment.allocatedCents
    if (payment.amountCents <= 0 || free <= 0) continue
    const take = Math.min(free, left)
    await insertAllocations(ctx, payment._id, client._id, [
      { jobId, amountCents: take },
    ])
    touched.push(payment._id)
    left -= take
  }
  if (left > 0) fail('credit.notEnough')
  await recomputeMoney(ctx, {
    paymentIds: touched,
    jobIds: [jobId],
    clientIds: [client._id],
  })
}

/**
 * Rewrites a payment: its own fields, and, when `allocations` is given, its
 * split (signed like the payment). The jobs it was on and the ones it lands
 * on are both refreshed.
 */
export async function rewritePayment(
  ctx: BusinessMutationCtx,
  payment: Doc<'payments'>,
  fields: PaymentFields,
  allocations?: Allocation[],
) {
  const rows = await ctx.db
    .query('allocations')
    .withIndex('by_payment', (q) => q.eq('paymentId', payment._id))
    .collect()
  if (allocations) {
    for (const row of rows) await ctx.db.delete('allocations', row._id)
    await insertAllocations(ctx, payment._id, payment.clientId, allocations)
  }
  await ctx.db.patch('payments', payment._id, fields)
  await recomputeMoney(ctx, {
    paymentIds: [payment._id],
    jobIds: [
      ...rows.map((row) => row.jobId),
      ...(allocations ?? []).map((allocation) => allocation.jobId),
    ],
    clientIds: [payment.clientId],
  })
}

/**
 * Removes a payment entered by mistake, with its allocations. The client's credit can go negative only if that credit was
 * already spent elsewhere; it is shown as it is.
 */
export async function removePayment(
  ctx: MutationCtx,
  payment: Doc<'payments'>,
) {
  const rows = await ctx.db
    .query('allocations')
    .withIndex('by_payment', (q) => q.eq('paymentId', payment._id))
    .collect()
  for (const row of rows) await ctx.db.delete('allocations', row._id)
  await ctx.db.delete('payments', payment._id)
  await recomputeMoney(ctx, {
    jobIds: rows.map((row) => row.jobId),
    clientIds: [payment.clientId],
  })
}

export async function insertCost(
  ctx: MutationCtx,
  cost: WithoutSystemFields<Doc<'costs'>>,
) {
  const costId = await ctx.db.insert('costs', cost)
  if (cost.jobId) await recomputeJob(ctx, cost.jobId)
  return costId
}

export async function patchCost(
  ctx: MutationCtx,
  cost: Doc<'costs'>,
  patch: Partial<Pick<Doc<'costs'>, 'amountCents' | 'date' | 'label' | 'note'>>,
) {
  await ctx.db.patch('costs', cost._id, patch)
  if (cost.jobId) await recomputeJob(ctx, cost.jobId)
}

export async function removeCost(ctx: MutationCtx, cost: Doc<'costs'>) {
  await ctx.db.delete('costs', cost._id)
  if (cost.jobId) await recomputeJob(ctx, cost.jobId)
}

/** A merge: the client's payments and allocations move to the other client. */
export async function moveClientMoney(
  ctx: MutationCtx,
  fromId: Id<'clients'>,
  intoId: Id<'clients'>,
) {
  for (const table of ['payments', 'allocations'] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex('by_client', (q) => q.eq('clientId', fromId))
      .collect()
    for (const row of rows) {
      await ctx.db.patch(table, row._id, { clientId: intoId })
    }
  }
  await recomputeClient(ctx, fromId)
  await recomputeClient(ctx, intoId)
}
