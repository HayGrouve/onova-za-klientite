import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import {
  clientFields,
  createClient,
  normalizePhones,
  syncPhones,
  vCreateClientArgs,
} from './lib/clientWrite'
import { mergeExtra } from './lib/extra'
import { clientSearchText, jobSearchText } from './lib/search'
import { optionalText, requiredText } from './lib/validate'
import { jobRow, newLookups, timeline } from './lib/views'

export const create = businessMutation({
  args: vCreateClientArgs.fields,
  returns: v.id('clients'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    return await createClient(ctx, args)
  },
})

/** "No client" is built in: it is never renamed, given contacts, merged or anonymized. */
export const update = businessMutation({
  args: {
    clientId: v.id('clients'),
    name: v.optional(v.string()),
    ...clientFields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = await getOwned(ctx, 'clients', args.clientId)
    if (client.isNoClient) fail('client.noClient')
    const patch: Partial<Doc<'clients'>> = {}
    if (args.name !== undefined)
      patch.name = requiredText(args.name, 'name', 120)
    if (args.kind !== undefined) patch.kind = args.kind
    if (args.phones !== undefined) patch.phones = normalizePhones(args.phones)
    if (args.email !== undefined)
      patch.email = optionalText(args.email, 'email', 200)
    if (args.address !== undefined)
      patch.address = optionalText(args.address, 'address', 500)
    if (args.note !== undefined)
      patch.note = optionalText(args.note, 'note', 5000)
    if (args.preferredChannel !== undefined)
      patch.preferredChannel = args.preferredChannel
    if (args.extra !== undefined) {
      patch.extra = await mergeExtra(
        ctx,
        ctx.business._id,
        'client',
        args.extra,
        client.extra,
      )
    }
    const next = { ...client, ...patch }
    patch.searchText = await clientSearchText(ctx, next)
    await ctx.db.patch('clients', client._id, patch)
    if (patch.phones) await syncPhones(ctx, client._id, patch.phones)

    // Job search keys include the client's name.
    if (patch.name !== undefined && patch.name !== client.name) {
      const jobs = await ctx.db
        .query('jobs')
        .withIndex('by_client', (q) => q.eq('clientId', client._id))
        .collect()
      for (const job of jobs) {
        await ctx.db.patch('jobs', job._id, {
          searchText: await jobSearchText(ctx, job),
        })
      }
    }
    await logActivity(ctx, {
      type: 'client.edited',
      clientId: client._id,
      data: { from: client.name, to: next.name },
    })
    return null
  },
})

/** Every client, by name, with what they owe and hold in credit. "No client" comes last. */
export const list = businessQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('clients'),
      name: v.string(),
      kind: v.union(v.literal('person'), v.literal('company')),
      isNoClient: v.boolean(),
      phone: v.optional(v.string()),
      creditCents: v.number(),
      owedCents: v.number(),
      openJobs: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const businessId = ctx.business._id
    const clients = await ctx.db
      .query('clients')
      .withIndex('by_business_name', (q) => q.eq('businessId', businessId))
      .take(2000)
    // What each client owes: one pass over the jobs that owe.
    const owing = await ctx.db
      .query('jobs')
      .withIndex('by_business_owes', (q) =>
        q.eq('businessId', businessId).eq('owes', true),
      )
      .collect()
    const owed = new Map<string, number>()
    for (const job of owing)
      owed.set(job.clientId, (owed.get(job.clientId) ?? 0) + job.balanceCents)
    const open = new Map<string, number>()
    for (const group of ['new', 'in_progress'] as const) {
      const jobs = await ctx.db
        .query('jobs')
        .withIndex('by_business_group_due', (q) =>
          q.eq('businessId', businessId).eq('stageGroup', group),
        )
        .collect()
      for (const job of jobs)
        open.set(job.clientId, (open.get(job.clientId) ?? 0) + 1)
    }
    return clients
      .filter((client) => client.mergedIntoId === undefined)
      .sort((a, b) =>
        a.isNoClient === b.isNoClient
          ? a.name.localeCompare(b.name, 'bg')
          : a.isNoClient
            ? 1
            : -1,
      )
      .map((client) => ({
        _id: client._id,
        name: client.name,
        kind: client.kind,
        isNoClient: client.isNoClient,
        phone: client.phones.at(0)?.e164,
        creditCents: client.creditCents,
        owedCents: owed.get(client._id) ?? 0,
        openJobs: open.get(client._id) ?? 0,
      }))
  },
})

/** Everything the client page shows. */
export const get = businessQuery({
  args: { clientId: v.id('clients') },
  handler: async (ctx, { clientId }) => {
    const client = await getOwned(ctx, 'clients', clientId)
    const jobs = await ctx.db
      .query('jobs')
      .withIndex('by_client', (q) => q.eq('clientId', client._id))
      .collect()
    const lookups = newLookups()
    const jobRows = []
    for (const job of jobs.sort((a, b) => b._creationTime - a._creationTime)) {
      jobRows.push(await jobRow(ctx, job, lookups))
    }
    const items = ctx.business.modules.items
      ? await ctx.db
          .query('items')
          .withIndex('by_client', (q) => q.eq('clientId', client._id))
          .collect()
      : []
    const payments = await ctx.db
      .query('payments')
      .withIndex('by_client', (q) => q.eq('clientId', client._id))
      .collect()
    const fields = await ctx.db
      .query('fields')
      .withIndex('by_business_target_order', (q) =>
        q.eq('businessId', ctx.business._id).eq('target', 'client'),
      )
      .collect()
    const events = await ctx.db
      .query('activity')
      .withIndex('by_client', (q) => q.eq('clientId', client._id))
      .collect()
    return {
      client,
      jobs: jobRows,
      owedCents: jobRows
        .filter((job) => job.owes)
        .reduce((sum, job) => sum + job.balanceCents, 0),
      items: items.map(({ _id, name, extra }) => ({ _id, name, extra })),
      payments: payments
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b._creationTime - a._creationTime,
        )
        .map(
          ({
            _id,
            amountCents,
            allocatedCents,
            date,
            method,
            label,
            note,
          }) => ({
            _id,
            amountCents,
            allocatedCents,
            date,
            method,
            label,
            note,
          }),
        ),
      fields: fields.filter((field) => field.archivedAt === undefined),
      timeline: await timeline(ctx, events),
    }
  },
})
