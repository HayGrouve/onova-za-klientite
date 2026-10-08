import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { isValidMonth, monthRange } from '../shared/dates'
import { sumCents } from '../shared/money'
import { businessQuery, requireRole } from './lib/auth'
import { fail } from './lib/errors'

/**
 * The Money screen for one month (Calculated values in the plan): received,
 * costs and profit in the month; still owed, who owes me and credit held now.
 */
export const summary = businessQuery({
  args: { month: v.string() },
  returns: v.object({
    receivedCents: v.number(),
    costCents: v.number(),
    profitCents: v.number(),
    stillOwedCents: v.number(),
    creditHeldCents: v.number(),
    whoOwesMe: v.array(
      v.object({
        clientId: v.id('clients'),
        name: v.string(),
        isNoClient: v.boolean(),
        owedCents: v.number(),
        /** The part of owedCents on jobs in the Done group. */
        doneOwedCents: v.number(),
        jobs: v.number(),
        doneJobs: v.number(),
        phone: v.optional(v.string()),
      }),
    ),
    payments: v.array(
      v.object({
        _id: v.id('payments'),
        date: v.string(),
        amountCents: v.number(),
        method: v.union(
          v.literal('cash'),
          v.literal('bank'),
          v.literal('card'),
          v.literal('other'),
        ),
        label: v.optional(v.string()),
        clientId: v.id('clients'),
        clientName: v.string(),
        /** The jobs it paid, or took money back from. */
        jobs: v.array(v.object({ _id: v.id('jobs'), title: v.string() })),
        /** The part that sits in client credit (or, for a refund, came out of it). */
        creditCents: v.number(),
      }),
    ),
    costs: v.array(
      v.object({
        _id: v.id('costs'),
        date: v.string(),
        amountCents: v.number(),
        label: v.string(),
        note: v.optional(v.string()),
        jobId: v.optional(v.id('jobs')),
        jobTitle: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, { month }) => {
    // Level 2: a Worker records payments but sees no totals.
    requireRole(ctx.member, 'manager')
    if (!isValidMonth(month)) fail('invalid', { field: 'month' })
    const businessId = ctx.business._id
    const { from, to } = monthRange(month)

    const payments = await ctx.db
      .query('payments')
      .withIndex('by_business_date', (q) =>
        q.eq('businessId', businessId).gte('date', from).lte('date', to),
      )
      .collect()
    const costs = await ctx.db
      .query('costs')
      .withIndex('by_business_date', (q) =>
        q.eq('businessId', businessId).gte('date', from).lte('date', to),
      )
      .collect()

    const owing = await ctx.db
      .query('jobs')
      .withIndex('by_business_owes', (q) =>
        q.eq('businessId', businessId).eq('owes', true),
      )
      .collect()
    const byClient = new Map<
      string,
      {
        owedCents: number
        doneOwedCents: number
        jobs: number
        doneJobs: number
      }
    >()
    for (const job of owing) {
      const entry = byClient.get(job.clientId) ?? {
        owedCents: 0,
        doneOwedCents: 0,
        jobs: 0,
        doneJobs: 0,
      }
      entry.owedCents += job.balanceCents
      entry.jobs += 1
      if (job.stageGroup === 'done') {
        entry.doneOwedCents += job.balanceCents
        entry.doneJobs += 1
      }
      byClient.set(job.clientId, entry)
    }

    const clients = await ctx.db
      .query('clients')
      .withIndex('by_business_name', (q) => q.eq('businessId', businessId))
      .collect()
    const clientById = new Map(
      clients.map((client) => [client._id as string, client]),
    )

    // Q7: everyone with a balance; done work first, then the most owed.
    const whoOwesMe = [...byClient.entries()]
      .map(([clientId, entry]) => {
        const client = clientById.get(clientId)
        return {
          clientId: client!._id,
          name: client?.name ?? '',
          isNoClient: client?.isNoClient ?? false,
          phone: client?.phones.at(0)?.e164,
          ...entry,
        }
      })
      .sort(
        (a, b) =>
          Number(b.doneJobs > 0) - Number(a.doneJobs > 0) ||
          b.owedCents - a.owedCents,
      )

    const jobTitles = new Map<string, string>()
    const titleOf = async (jobId: Id<'jobs'>) => {
      if (!jobTitles.has(jobId)) {
        jobTitles.set(jobId, (await ctx.db.get('jobs', jobId))?.title ?? '')
      }
      return jobTitles.get(jobId) ?? ''
    }
    for (const cost of costs) {
      if (cost.jobId) await titleOf(cost.jobId)
    }

    // Which jobs each payment paid, and how much of it is left as credit.
    const sortedPayments = payments.sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b._creationTime - a._creationTime,
    )
    const paymentRows = []
    for (const payment of sortedPayments) {
      const allocations = await ctx.db
        .query('allocations')
        .withIndex('by_payment', (q) => q.eq('paymentId', payment._id))
        .collect()
      const jobs: Array<{ _id: Id<'jobs'>; title: string }> = []
      for (const allocation of allocations) {
        if (!jobs.some((job) => job._id === allocation.jobId)) {
          jobs.push({
            _id: allocation.jobId,
            title: await titleOf(allocation.jobId),
          })
        }
      }
      const allocated = sumCents(
        allocations.map((allocation) => allocation.amountCents),
      )
      paymentRows.push({
        _id: payment._id,
        date: payment.date,
        amountCents: payment.amountCents,
        method: payment.method,
        label: payment.label,
        clientId: payment.clientId,
        clientName: clientById.get(payment.clientId)?.name ?? '',
        jobs,
        creditCents:
          payment.amountCents > 0
            ? Math.max(payment.amountCents - allocated, 0)
            : allocations.length > 0
              ? 0
              : -payment.amountCents,
      })
    }

    const receivedCents = sumCents(
      payments.map((payment) => payment.amountCents),
    )
    const costCents = sumCents(costs.map((cost) => cost.amountCents))
    return {
      receivedCents,
      costCents,
      profitCents: receivedCents - costCents,
      stillOwedCents: sumCents(owing.map((job) => job.balanceCents)),
      creditHeldCents: sumCents(
        clients
          .filter((client) => client.creditCents > 0)
          .map((client) => client.creditCents),
      ),
      whoOwesMe,
      payments: paymentRows,
      costs: costs
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b._creationTime - a._creationTime,
        )
        .map((cost) => ({
          _id: cost._id,
          date: cost.date,
          amountCents: cost.amountCents,
          label: cost.label,
          note: cost.note,
          jobId: cost.jobId,
          jobTitle: cost.jobId ? jobTitles.get(cost.jobId) : undefined,
        })),
    }
  },
})
