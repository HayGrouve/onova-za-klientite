import { v } from 'convex/values'
import { addDays, isValidDate, sofiaTimeToUtc } from '../shared/dates'
import { businessQuery } from './lib/auth'
import { fail } from './lib/errors'

const MAX_JOBS = 300
const MAX_CLIENTS = 2000

/**
 * What must survive a basement with no signal (ADR 0010): today's and open
 * jobs with their details, and clients with their contacts. The browser keeps
 * the latest copy in IndexedDB and shows it read-only when offline.
 */
export const snapshot = businessQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    if (!isValidDate(today)) fail('invalid', { field: 'today' })
    const business = ctx.business
    const stages = await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) => q.eq('businessId', business._id))
      .collect()
    const stageById = new Map(
      stages.map((stage) => [stage._id as string, stage]),
    )

    const jobs = []
    for (const group of ['new', 'in_progress'] as const) {
      jobs.push(
        ...(await ctx.db
          .query('jobs')
          .withIndex('by_business_group_due', (q) =>
            q.eq('businessId', business._id).eq('stageGroup', group),
          )
          .take(MAX_JOBS)),
      )
    }
    const unpaidDone = await ctx.db
      .query('jobs')
      .withIndex('by_business_owes', (q) =>
        q
          .eq('businessId', business._id)
          .eq('owes', true)
          .eq('stageGroup', 'done'),
      )
      .take(MAX_JOBS)

    const from = sofiaTimeToUtc(today, 0, 0)
    const to = sofiaTimeToUtc(addDays(today, 8), 0, 0)
    const appointments = (
      await ctx.db
        .query('appointments')
        .withIndex('by_business_start', (q) =>
          q.eq('businessId', business._id).gte('start', from).lt('start', to),
        )
        .collect()
    ).filter((item) => item.cancelledAt === undefined)

    const clients = (
      await ctx.db
        .query('clients')
        .withIndex('by_business_name', (q) => q.eq('businessId', business._id))
        .take(MAX_CLIENTS)
    ).filter((client) => client.mergedIntoId === undefined)
    const clientName = new Map(
      clients.map((client) => [client._id as string, client.name]),
    )

    return {
      businessName: business.name,
      words: business.words,
      today,
      jobs: [...jobs, ...unpaidDone].map((job) => {
        const stage = stageById.get(job.stageId)
        return {
          _id: job._id,
          title: job.title,
          clientId: job.clientId,
          clientName: clientName.get(job.clientId) ?? '',
          stageName: stage?.name ?? '',
          stageColor: stage?.color ?? 'gray',
          stageGroup: job.stageGroup,
          dueDate: job.dueDate,
          address: job.address,
          notes: job.notes,
          lines: job.lines.map(({ description, quantity, unitPriceCents }) => ({
            description,
            quantity,
            unitPriceCents,
          })),
          priceCents: job.priceCents,
          paidCents: job.paidCents,
          balanceCents: job.balanceCents,
        }
      }),
      appointments: appointments.map((item) => ({
        _id: item._id,
        jobId: item.jobId,
        start: item.start,
        allDay: item.allDay,
        label: item.label,
      })),
      clients: clients.map((client) => ({
        _id: client._id,
        name: client.name,
        isNoClient: client.isNoClient,
        phones: client.phones.map((phone) => phone.e164),
        email: client.email,
        address: client.address,
        note: client.note,
      })),
    }
  },
})
