import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { foldQuery, nameMatches } from '../shared/search'
import { businessQuery } from './lib/auth'
import { setJobSearchText } from './lib/ledger'
import { listExtra, listFieldIds } from './lib/listFields'
import type { ScopedCtx } from './lib/scope'
import { isWorker, seesClient, seesItem, seesJob } from './lib/scope'
import { clientSearchText, itemSearchText, jobSearchText } from './lib/search'
import { jobRow, newLookups, vJobRow } from './lib/views'
import { vExtra } from './validators'

const PER_KIND = 8
/**
 * A Worker's own jobs are searched in `jobAssignments`, limited to them by the
 * index, so any match is theirs (D109). Their clients and items are still found
 * in the business-wide indexes, which can't be limited to a member, so more of
 * the matches are read to find theirs.
 */
const WORKER_READ = 64

type ClientHit = {
  _id: Id<'clients'>
  name: string
  phone?: string
  isNoClient: boolean
}
type ItemHit = {
  _id: Id<'items'>
  name: string
  clientId: Id<'clients'>
  clientName: string
  listExtra?: Doc<'items'>['extra']
}

/**
 * A Worker's jobs matching a folded query, best first, from the search index
 * of their assignment rows. It also adds to `clients` the clients of the
 * matching jobs whose name matches the query: a name is part of its jobs' keys,
 * so a Worker finds their own client by name however many other clients in the
 * business match.
 */
async function workerJobHits(
  ctx: ScopedCtx,
  variant: string,
  query: string,
  clients: Map<string, ClientHit>,
) {
  const rows = await ctx.db
    .query('jobAssignments')
    .withSearchIndex('search', (q) =>
      q.search('searchText', variant).eq('membershipId', ctx.member._id),
    )
    .take(WORKER_READ)
  const jobs: Array<Doc<'jobs'>> = []
  const seen = new Set<Id<'clients'>>()
  for (const row of rows) {
    const job = await ctx.db.get('jobs', row.jobId)
    if (!job) continue
    jobs.push(job)
    if (seen.has(row.clientId)) continue
    seen.add(row.clientId)
    const client = await ctx.db.get('clients', row.clientId)
    if (
      client &&
      client.mergedIntoId === undefined &&
      !clients.has(client._id) &&
      nameMatches(query, client.name)
    ) {
      clients.set(client._id, {
        _id: client._id,
        name: client.name,
        phone: client.phones.at(0)?.e164,
        isNoClient: client.isNoClient,
      })
    }
  }
  return jobs
}

/**
 * One box over clients, jobs and items (CONTEXT "Search"). Each folded variant
 * of the query is searched and the results merged, best match first. A
 * Worker finds only their jobs and those jobs' clients and items (D89). Their
 * jobs come from the search index of their assignment rows (D109); a client
 * is found through those jobs by name, and by what the clients index returns.
 */
export const all = businessQuery({
  args: { query: v.string() },
  returns: v.object({
    clients: v.array(
      v.object({
        _id: v.id('clients'),
        name: v.string(),
        phone: v.optional(v.string()),
        isNoClient: v.boolean(),
      }),
    ),
    jobs: v.array(vJobRow),
    items: v.array(
      v.object({
        _id: v.id('items'),
        name: v.string(),
        clientId: v.id('clients'),
        clientName: v.string(),
        listExtra: v.optional(vExtra),
      }),
    ),
  }),
  handler: async (ctx, { query }) => {
    const variants = foldQuery(query.slice(0, 100))
    const businessId = ctx.business._id
    const clients = new Map<string, ClientHit>()
    const jobs = new Map<string, Awaited<ReturnType<typeof jobRow>>>()
    const items = new Map<string, ItemHit>()
    let shownItemFields: Set<string> | undefined
    const lookups = newLookups()
    const worker = isWorker(ctx.member)
    const read = worker ? WORKER_READ : PER_KIND

    for (const variant of variants) {
      const foundClients = await ctx.db
        .query('clients')
        .withSearchIndex('search', (q) =>
          q.search('searchText', variant).eq('businessId', businessId),
        )
        .take(read)
      for (const client of foundClients) {
        if (client.mergedIntoId !== undefined || clients.has(client._id))
          continue
        if (!(await seesClient(ctx, client._id))) continue
        clients.set(client._id, {
          _id: client._id,
          name: client.name,
          phone: client.phones.at(0)?.e164,
          isNoClient: client.isNoClient,
        })
      }
      const foundJobs = worker
        ? await workerJobHits(ctx, variant, query, clients)
        : await ctx.db
            .query('jobs')
            .withSearchIndex('search', (q) =>
              q.search('searchText', variant).eq('businessId', businessId),
            )
            .take(read)
      for (const job of foundJobs.filter((found) =>
        seesJob(ctx.member, found),
      )) {
        if (!jobs.has(job._id))
          jobs.set(job._id, await jobRow(ctx, job, lookups))
      }
      if (ctx.business.modules.items) {
        shownItemFields ??= await listFieldIds(ctx, businessId, 'item')
        const foundItems = await ctx.db
          .query('items')
          .withSearchIndex('search', (q) =>
            q.search('searchText', variant).eq('businessId', businessId),
          )
          .take(read)
        for (const item of foundItems) {
          if (items.has(item._id)) continue
          if (!(await seesItem(ctx, item._id))) continue
          const owner = await ctx.db.get('clients', item.clientId)
          items.set(item._id, {
            _id: item._id,
            name: item.name,
            clientId: item.clientId,
            clientName: owner?.name ?? '',
            listExtra: listExtra(item.extra, shownItemFields),
          })
        }
      }
    }
    // As many as anyone else would get: PER_KIND for each folded variant.
    const most = PER_KIND * variants.length
    return {
      clients: [...clients.values()].slice(0, most),
      jobs: [...jobs.values()].slice(0, most),
      items: [...items.values()].slice(0, most),
    }
  },
})

const REBUILD_PAGE = 100
/** The order records are rebuilt in: jobs read their client's name. */
const REBUILD_NEXT = { clients: 'jobs', jobs: 'items', items: null } as const

/**
 * Rebuilds every stored search key, in every business, with the current fold:
 * `npx convex run search:rebuildAll '{}'` (add `--prod` for production).
 * Run it after the fold in shared/search.ts changes; it is safe to run twice.
 * It does clients, then jobs, then items, a page of 100 at a time, each page
 * scheduling the next.
 */
export const rebuildAll = internalMutation({
  args: {
    table: v.optional(
      v.union(v.literal('clients'), v.literal('jobs'), v.literal('items')),
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const table = args.table ?? 'clients'
    const page = await ctx.db
      .query(table)
      .paginate({ cursor: args.cursor ?? null, numItems: REBUILD_PAGE })
    for (const doc of page.page) {
      if (table === 'clients') {
        const client = doc as Doc<'clients'>
        const searchText = await clientSearchText(ctx, client)
        // Unchanged rows aren't rewritten, so a second run wakes no query.
        if (searchText !== client.searchText) {
          await ctx.db.patch('clients', client._id, { searchText })
        }
      } else if (table === 'jobs') {
        const job = doc as Doc<'jobs'>
        const searchText = await jobSearchText(ctx, job)
        // Also the job's assignment rows, which copy it (D109).
        await setJobSearchText(ctx, job, searchText)
      } else {
        const item = doc as Doc<'items'>
        const searchText = await itemSearchText(ctx, item)
        if (searchText !== item.searchText) {
          await ctx.db.patch('items', item._id, { searchText })
        }
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.search.rebuildAll, {
        table,
        cursor: page.continueCursor,
      })
    } else if (REBUILD_NEXT[table]) {
      await ctx.scheduler.runAfter(0, internal.search.rebuildAll, {
        table: REBUILD_NEXT[table],
      })
    }
    return null
  },
})
