import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { isOpenGroup } from '../shared/stages'
import { owedCents } from '../shared/board'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getLiveClient,
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
import { listExtra, listFieldIds } from './lib/listFields'
import { setJobSearchText } from './lib/ledger'
import { clientSearchText, jobSearchText } from './lib/search'
import {
  getVisibleFromUrl,
  isWorker,
  seesEvent,
  visibleJobsOfClient,
  workerAssignments,
} from './lib/scope'
import type { ScopedCtx } from './lib/scope'
import { optionalText, requiredText } from './lib/validate'
import { vExtra } from './validators'
import {
  activeFields,
  jobRow,
  newLookups,
  openRemindersOn,
  timeline,
} from './lib/views'

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
    const client = await getLiveClient(ctx, args.clientId)
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
        await setJobSearchText(ctx, job, await jobSearchText(ctx, job))
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

/**
 * Every client, by name, with what they owe and hold in credit. "No client"
 * comes last. A Worker gets only the clients of their jobs, without money (D89).
 */
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
      /** Values of the client fields marked "show in list". */
      listExtra: v.optional(vExtra),
    }),
  ),
  handler: async (ctx) => {
    const businessId = ctx.business._id
    if (isWorker(ctx.member)) return await workerClients(ctx)
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
    const shown = await listFieldIds(ctx, businessId, 'client')
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
        listExtra: listExtra(client.extra, shown),
      }))
  },
})

/** The clients of a Worker's jobs, as `list` shows them, with no money. */
async function workerClients(ctx: ScopedCtx) {
  // From their assignments, an index on the Worker (D106): no job is read.
  const open = new Map<string, number>()
  for (const row of await workerAssignments(ctx)) {
    const count = isOpenGroup(row.stageGroup) ? 1 : 0
    open.set(row.clientId, (open.get(row.clientId) ?? 0) + count)
  }
  const shown = await listFieldIds(ctx, ctx.business._id, 'client')
  const rows = []
  for (const [clientId, openJobs] of open) {
    const client = await ctx.db.get('clients', clientId as Id<'clients'>)
    if (!client || client.mergedIntoId !== undefined) continue
    rows.push({
      _id: client._id,
      name: client.name,
      kind: client.kind,
      isNoClient: client.isNoClient,
      phone: client.phones.at(0)?.e164,
      creditCents: 0,
      owedCents: 0,
      openJobs,
      listExtra: listExtra(client.extra, shown),
    })
  }
  return rows.sort((a, b) =>
    a.isNoClient === b.isNoClient
      ? a.name.localeCompare(b.name, 'bg')
      : a.isNoClient
        ? 1
        : -1,
  )
}

/**
 * Everything the client page shows. A Worker sees it only through one of
 * their jobs, and then only those jobs, their items and their history (D89).
 */
export const get = businessQuery({
  // A string: the id comes from the address bar (see getOwnedFromUrl).
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const client = await getVisibleFromUrl(ctx, 'clients', clientId)
    const worker = isWorker(ctx.member)
    const jobs = await visibleJobsOfClient(ctx, client._id)
    const jobIds = new Set<string>(jobs.map((job) => job._id))
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
    const itemIds = worker
      ? new Set<string>(jobs.flatMap((job) => job.itemIds))
      : undefined
    const payments = worker
      ? []
      : await ctx.db
          .query('payments')
          .withIndex('by_client', (q) => q.eq('clientId', client._id))
          .collect()
    const events = (
      await ctx.db
        .query('activity')
        .withIndex('by_client', (q) => q.eq('clientId', client._id))
        .collect()
    ).filter(
      (event) =>
        seesEvent(ctx.member, event) &&
        (!worker || (event.jobId !== undefined && jobIds.has(event.jobId))),
    )
    const mergedInto = client.mergedIntoId
      ? await ctx.db.get('clients', client.mergedIntoId)
      : null
    return {
      client: worker ? { ...client, creditCents: 0 } : client,
      mergedIntoName: mergedInto?.name,
      jobs: jobRows,
      owedCents: worker ? 0 : owedCents(jobRows),
      items: items
        .filter((item) => !itemIds || itemIds.has(item._id))
        .map(({ _id, name, extra }) => ({ _id, name, extra })),
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
      fields: await activeFields(ctx, ctx.business._id, 'client'),
      reminders: worker
        ? []
        : await openRemindersOn(ctx, ctx.business, { clientId: client._id }),
      timeline: await timeline(ctx, events),
    }
  },
})
