import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { foldQuery } from '../shared/search'
import { businessQuery } from './lib/auth'
import { clientSearchText, itemSearchText, jobSearchText } from './lib/search'
import { jobRow, newLookups, vJobRow } from './lib/views'

const PER_KIND = 8

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
}

/**
 * One box over clients, jobs and items (CONTEXT "Search"). Each folded variant
 * of the query is searched and the results merged, best match first.
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
      }),
    ),
  }),
  handler: async (ctx, { query }) => {
    const variants = foldQuery(query.slice(0, 100))
    const businessId = ctx.business._id
    const clients = new Map<string, ClientHit>()
    const jobs = new Map<string, Awaited<ReturnType<typeof jobRow>>>()
    const items = new Map<string, ItemHit>()
    const lookups = newLookups()

    for (const variant of variants) {
      const foundClients = await ctx.db
        .query('clients')
        .withSearchIndex('search', (q) =>
          q.search('searchText', variant).eq('businessId', businessId),
        )
        .take(PER_KIND)
      for (const client of foundClients) {
        if (client.mergedIntoId !== undefined || clients.has(client._id))
          continue
        clients.set(client._id, {
          _id: client._id,
          name: client.name,
          phone: client.phones.at(0)?.e164,
          isNoClient: client.isNoClient,
        })
      }
      const foundJobs = await ctx.db
        .query('jobs')
        .withSearchIndex('search', (q) =>
          q.search('searchText', variant).eq('businessId', businessId),
        )
        .take(PER_KIND)
      for (const job of foundJobs) {
        if (!jobs.has(job._id))
          jobs.set(job._id, await jobRow(ctx, job, lookups))
      }
      if (ctx.business.modules.items) {
        const foundItems = await ctx.db
          .query('items')
          .withSearchIndex('search', (q) =>
            q.search('searchText', variant).eq('businessId', businessId),
          )
          .take(PER_KIND)
        for (const item of foundItems) {
          if (items.has(item._id)) continue
          const owner = await ctx.db.get('clients', item.clientId)
          items.set(item._id, {
            _id: item._id,
            name: item.name,
            clientId: item.clientId,
            clientName: owner?.name ?? '',
          })
        }
      }
    }
    return {
      clients: [...clients.values()],
      jobs: [...jobs.values()],
      items: [...items.values()],
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
        await ctx.db.patch('clients', client._id, {
          searchText: await clientSearchText(ctx, client),
        })
      } else if (table === 'jobs') {
        const job = doc as Doc<'jobs'>
        await ctx.db.patch('jobs', job._id, {
          searchText: await jobSearchText(ctx, job),
        })
      } else {
        const item = doc as Doc<'items'>
        await ctx.db.patch('items', item._id, {
          searchText: await itemSearchText(ctx, item),
        })
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
