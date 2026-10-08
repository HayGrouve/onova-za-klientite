import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import {
  checkAllocations,
  creditForJob,
  jobOwedCents,
  splitPayment,
} from '../shared/allocation'
import {
  paymentAmountRange,
  paymentPrepaidCents,
  paymentRemovable,
  planPaymentEdit,
} from '../shared/payment-edit'
import type { PaymentEditState } from '../shared/payment-edit'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getSettlingClient,
  getOwned,
  requireRole,
} from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import {
  payJob,
  recordPayment,
  removePayment,
  rewritePayment,
  spendCredit,
} from './lib/ledger'
import type { PaymentFields } from './lib/ledger'
import { isWorker, seesJob } from './lib/scope'
import { calendarDate, cents, optionalText } from './lib/validate'
import { vPaymentMethod } from './validators'

const paymentFields = {
  amountCents: v.number(),
  date: v.string(),
  method: vPaymentMethod,
  label: v.optional(v.string()),
  note: v.optional(v.string()),
}

/** A worker may record a payment on a job assigned to them, and nothing else (Level 2). */
function requireJobMoneyAccess(ctx: BusinessMutationCtx, job: Doc<'jobs'>) {
  if (!seesJob(ctx.member, job)) fail('auth.forbidden')
}

/** A payment's fields from the arguments, checked. */
function checkedPayment(fields: PaymentFields): PaymentFields {
  return {
    amountCents: fields.amountCents,
    date: calendarDate(fields.date, 'date'),
    method: fields.method,
    label: optionalText(fields.label, 'label', 100),
    note: optionalText(fields.note, 'note', 1000),
  }
}

/** The client's jobs that still owe, oldest first. */
async function openJobs(ctx: BusinessMutationCtx, clientId: Id<'clients'>) {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_client', (q) => q.eq('clientId', clientId))
    .collect()
  return jobs.filter((job) => job.owes)
}

/**
 * Paying from a job allocates to that job, up to its balance. Any rest is
 * kept as client credit, except from a Worker, who may not take more than the
 * balance.
 */
export const addFromJob = businessMutation({
  args: { jobId: v.id('jobs'), ...paymentFields },
  returns: v.id('payments'),
  handler: async (ctx, args) => {
    const job = await getOwned(ctx, 'jobs', args.jobId)
    requireJobMoneyAccess(ctx, job)
    const amountCents = cents(args.amountCents, 'amountCents')
    if (amountCents === 0) fail('payment.zero')
    // A Worker takes money on site for the job, up to what it owes. Prepaid
    // credit is a Manager's to hold (D89).
    if (isWorker(ctx.member) && amountCents > jobOwedCents(job)) {
      fail('payment.exceeds', { limitCents: jobOwedCents(job) })
    }

    const paymentId = await payJob(
      ctx,
      job._id,
      checkedPayment({ ...args, amountCents }),
    )
    await logActivity(ctx, {
      type: 'payment.added',
      jobId: job._id,
      clientId: job.clientId,
      paymentId,
      data: { amountCents, note: args.label },
    })
    return paymentId
  },
})

/**
 * Paying from a client splits the payment across their jobs: as given, or
 * oldest first when no split is given. The rest is client credit.
 */
export const addFromClient = businessMutation({
  args: {
    clientId: v.id('clients'),
    ...paymentFields,
    allocations: v.optional(
      v.array(v.object({ jobId: v.id('jobs'), amountCents: v.number() })),
    ),
  },
  returns: v.id('payments'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = await getSettlingClient(ctx, args.clientId)
    const amountCents = cents(args.amountCents, 'amountCents')
    if (amountCents === 0) fail('payment.zero')

    let allocations: Array<{ jobId: Id<'jobs'>; amountCents: number }>
    if (args.allocations) {
      allocations = args.allocations
      const merged = new Map<Id<'jobs'>, number>()
      for (const allocation of allocations) {
        cents(allocation.amountCents, 'allocations')
        merged.set(
          allocation.jobId,
          (merged.get(allocation.jobId) ?? 0) + allocation.amountCents,
        )
      }
      for (const [jobId, total] of merged) {
        const job = await getOwned(ctx, 'jobs', jobId)
        if (job.clientId !== client._id) fail('job.otherClient', { jobId })
        if (!job.owes || total > job.balanceCents) {
          fail('payment.exceeds', { jobId })
        }
      }
    } else {
      const jobs = await openJobs(ctx, client._id)
      allocations = splitPayment(
        amountCents,
        jobs.map((job) => ({ jobId: job._id, balanceCents: job.balanceCents })),
      ).allocations
    }
    const check = checkAllocations(amountCents, allocations)
    if (check === 'signMismatch' || check === 'zero')
      fail('payment.signMismatch')
    if (check === 'exceedsPayment') fail('payment.exceeds')

    const paymentId = await recordPayment(
      ctx,
      client._id,
      checkedPayment({ ...args, amountCents }),
      allocations,
    )
    await logActivity(ctx, {
      type: 'payment.added',
      clientId: client._id,
      paymentId,
      data: { amountCents, note: args.label },
    })
    return paymentId
  },
})

/**
 * A refund is a negative payment. From a job it takes back part of what the
 * job was paid; without a job it pays back client credit.
 */
export const refund = businessMutation({
  args: {
    clientId: v.id('clients'),
    jobId: v.optional(v.id('jobs')),
    amountCents: v.number(),
    date: v.string(),
    method: vPaymentMethod,
    note: v.optional(v.string()),
  },
  returns: v.id('payments'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = await getSettlingClient(ctx, args.clientId)
    const amountCents = cents(args.amountCents, 'amountCents')
    if (amountCents === 0) fail('payment.zero')

    let job: Doc<'jobs'> | null = null
    if (args.jobId) {
      job = await getOwned(ctx, 'jobs', args.jobId)
      if (job.clientId !== client._id) fail('job.otherClient')
      if (amountCents > job.paidCents) fail('payment.exceeds')
    } else if (amountCents > client.creditCents) {
      fail('credit.notEnough')
    }

    const paymentId = await recordPayment(
      ctx,
      client._id,
      checkedPayment({
        amountCents: -amountCents,
        date: args.date,
        method: args.method,
        note: args.note,
      }),
      job ? [{ jobId: job._id, amountCents: -amountCents }] : [],
    )
    await logActivity(ctx, {
      type: 'payment.added',
      clientId: client._id,
      jobId: job?._id,
      paymentId,
      data: { amountCents: -amountCents, note: args.note },
    })
    return paymentId
  },
})

/**
 * Applies the client's credit to a job (Q8: never automatic). Takes the
 * unallocated part of their payments, oldest first.
 */
export const useCredit = businessMutation({
  args: { jobId: v.id('jobs'), amountCents: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const client = await getOwned(ctx, 'clients', job.clientId)
    const wanted =
      args.amountCents === undefined
        ? creditForJob(client.creditCents, job)
        : cents(args.amountCents, 'amountCents')
    await spendCredit(ctx, job._id, wanted)
    await logActivity(ctx, {
      type: 'credit.used',
      jobId: job._id,
      clientId: client._id,
      data: { amountCents: wanted },
    })
    return wanted
  },
})

/**
 * Removes a payment entered by mistake, with its allocations. Not once money
 * was refunded against it: that would take a job or the credit below zero
 * (D26), so the refund goes first.
 */
export const remove = businessMutation({
  args: { paymentId: v.id('payments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const payment = await getOwned(ctx, 'payments', args.paymentId)
    const { state } = await loadEditState(ctx, payment)
    if (!paymentRemovable(state)) fail('payment.refunded')
    await removePayment(ctx, payment)
    await logActivity(ctx, {
      type: 'payment.removed',
      clientId: payment.clientId,
      data: { amountCents: payment.amountCents },
    })
    return null
  },
})

/**
 * Where a payment sits and what its jobs and its client hold: the facts that
 * decide which amounts an edit may use (`shared/payment-edit.ts`).
 */
async function loadEditState(ctx: QueryCtx, payment: Doc<'payments'>) {
  const rows = await ctx.db
    .query('allocations')
    .withIndex('by_payment', (q) => q.eq('paymentId', payment._id))
    .collect()
  const onJob = new Map<Id<'jobs'>, number>()
  for (const row of rows) {
    onJob.set(
      row.jobId,
      (onJob.get(row.jobId) ?? 0) + Math.abs(row.amountCents),
    )
  }
  const jobs = new Map<Id<'jobs'>, Doc<'jobs'>>()
  for (const jobId of onJob.keys()) {
    const job = await ctx.db.get('jobs', jobId)
    if (job) jobs.set(jobId, job)
  }
  const client = await ctx.db.get('clients', payment.clientId)
  const state: PaymentEditState<Id<'jobs'>> = {
    kind: payment.amountCents < 0 ? 'refund' : 'payment',
    amountCents: Math.abs(payment.amountCents),
    jobs: [...jobs.values()].map((job) => ({
      jobId: job._id,
      allocatedCents: onJob.get(job._id) ?? 0,
      paidCents: job.paidCents,
      roomCents: jobOwedCents(job),
    })),
    clientCreditCents: client?.creditCents ?? 0,
  }
  return { state, jobs }
}

/**
 * One payment with how it was split across jobs, and the amounts an edit may
 * use. A Worker may look only at a payment on a job assigned to them, and
 * sees only the share that went to their jobs (D89).
 */
export const get = businessQuery({
  args: { paymentId: v.id('payments') },
  returns: v.object({
    _id: v.id('payments'),
    clientId: v.id('clients'),
    amountCents: v.number(),
    date: v.string(),
    method: vPaymentMethod,
    label: v.optional(v.string()),
    note: v.optional(v.string()),
    allocations: v.array(
      v.object({
        jobId: v.id('jobs'),
        title: v.string(),
        amountCents: v.number(),
      }),
    ),
    prepaidCents: v.number(),
    /** False once money was refunded against it: delete the refund first. */
    removable: v.boolean(),
    range: v.object({
      minCents: v.number(),
      maxCents: v.union(v.number(), v.null()),
      why: v.union(
        v.literal('none'),
        v.literal('refunded'),
        v.literal('allocated'),
      ),
    }),
  }),
  handler: async (ctx, args) => {
    const payment = await getOwned(ctx, 'payments', args.paymentId)
    const { state, jobs } = await loadEditState(ctx, payment)
    const sign = Math.sign(payment.amountCents)
    const allocations = state.jobs.map((job) => ({
      jobId: job.jobId,
      title: jobs.get(job.jobId)?.title ?? '',
      amountCents: sign * job.allocatedCents,
    }))
    if (isWorker(ctx.member)) {
      const own = allocations.filter((allocation) => {
        const job = jobs.get(allocation.jobId)
        return job !== undefined && seesJob(ctx.member, job)
      })
      if (own.length === 0) fail('auth.forbidden')
      return {
        _id: payment._id,
        clientId: payment.clientId,
        amountCents: own.reduce((sum, item) => sum + item.amountCents, 0),
        date: payment.date,
        method: payment.method,
        label: payment.label,
        note: payment.note,
        allocations: own,
        prepaidCents: 0,
        removable: false,
        range: { minCents: 0, maxCents: null, why: 'none' as const },
      }
    }
    return {
      _id: payment._id,
      clientId: payment.clientId,
      amountCents: payment.amountCents,
      date: payment.date,
      method: payment.method,
      label: payment.label,
      note: payment.note,
      allocations,
      prepaidCents: paymentPrepaidCents(state),
      removable: paymentRemovable(state),
      range: paymentAmountRange(state),
    }
  },
})

/**
 * Edits a payment. The date, method and label always change. The amount is
 * reallocated in the same mutation (ADR 0008) and may not drop below what has
 * already been refunded or used, which keeps every job's paid total and the
 * client's credit from going negative (D26). A payment keeps its sign.
 */
export const update = businessMutation({
  args: {
    paymentId: v.id('payments'),
    /** The amount without its sign: a refund stays a refund. */
    amountCents: v.number(),
    date: v.string(),
    method: vPaymentMethod,
    label: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const payment = await getOwned(ctx, 'payments', args.paymentId)
    const amountCents = cents(args.amountCents, 'amountCents')
    if (amountCents === 0) fail('payment.zero')
    const fields = {
      date: calendarDate(args.date, 'date'),
      method: args.method,
      label: optionalText(args.label, 'label', 100),
      note: optionalText(args.note, 'note', 1000),
    }
    const sign = Math.sign(payment.amountCents)
    const amountChanged = amountCents !== Math.abs(payment.amountCents)
    if (
      !amountChanged &&
      fields.date === payment.date &&
      fields.method === payment.method &&
      fields.label === payment.label &&
      fields.note === payment.note
    ) {
      return null
    }

    const { state, jobs } = await loadEditState(ctx, payment)
    let allocations:
      Array<{ jobId: Id<'jobs'>; amountCents: number }> | undefined
    if (amountChanged) {
      const plan = planPaymentEdit(state, amountCents)
      if (!plan.ok) {
        const limit = { limitCents: plan.limitCents }
        if (plan.reason === 'tooLow') fail('payment.tooLow', limit)
        fail(
          state.jobs.length > 0 ? 'payment.exceeds' : 'credit.notEnough',
          limit,
        )
      }
      const same =
        plan.allocations.length === state.jobs.length &&
        plan.allocations.every((allocation) =>
          state.jobs.some(
            (job) =>
              job.jobId === allocation.jobId &&
              job.allocatedCents === allocation.amountCents,
          ),
        )
      if (!same) {
        allocations = plan.allocations.map((allocation) => ({
          jobId: allocation.jobId,
          amountCents: sign * allocation.amountCents,
        }))
      }
    }
    await rewritePayment(
      ctx,
      payment,
      { amountCents: sign * amountCents, ...fields },
      allocations,
    )
    await logActivity(ctx, {
      type: 'payment.edited',
      clientId: payment.clientId,
      jobId: jobs.size === 1 ? [...jobs.keys()][0] : undefined,
      paymentId: payment._id,
      data: { amountCents: sign * amountCents, note: fields.label },
    })
    return null
  },
})
