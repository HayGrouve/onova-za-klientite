import { v } from 'convex/values'
import { monthRange } from '../shared/dates'
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
        jobs: v.number(),
        doneJobs: v.number(),
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
    if (!/^\d{4}-\d{2}$/.test(month)) fail('invalid', { field: 'month' })
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
      { owedCents: number; jobs: number; doneJobs: number }
    >()
    for (const job of owing) {
      const entry = byClient.get(job.clientId) ?? {
        owedCents: 0,
        jobs: 0,
        doneJobs: 0,
      }
      entry.owedCents += job.balanceCents
      entry.jobs += 1
      if (job.stageGroup === 'done') entry.doneJobs += 1
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
          ...entry,
        }
      })
      .sort(
        (a, b) =>
          Number(b.doneJobs > 0) - Number(a.doneJobs > 0) ||
          b.owedCents - a.owedCents,
      )

    const jobTitles = new Map<string, string>()
    for (const cost of costs) {
      if (cost.jobId && !jobTitles.has(cost.jobId)) {
        jobTitles.set(
          cost.jobId,
          (await ctx.db.get('jobs', cost.jobId))?.title ?? '',
        )
      }
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
      payments: payments
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b._creationTime - a._creationTime,
        )
        .map((payment) => ({
          _id: payment._id,
          date: payment.date,
          amountCents: payment.amountCents,
          method: payment.method,
          label: payment.label,
          clientId: payment.clientId,
          clientName: clientById.get(payment.clientId)?.name ?? '',
        })),
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
