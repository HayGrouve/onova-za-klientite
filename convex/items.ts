import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getLiveClient,
  getOwned,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import { mergeExtra } from './lib/extra'
import { setJobItems } from './lib/jobWrite'
import { getVisibleFromUrl, isWorker, seesEvent, seesJob } from './lib/scope'
import { itemSearchText } from './lib/search'
import { requiredText } from './lib/validate'
import {
  activeFields,
  jobRow,
  newLookups,
  openRemindersOn,
  timeline,
} from './lib/views'
import { vExtra } from './validators'

/**
 * Adds an item to a client. Started from a job's item list, it also links the
 * new item to that job, in the same write.
 */
export const create = businessMutation({
  args: {
    clientId: v.id('clients'),
    name: v.string(),
    extra: v.optional(vExtra),
    jobId: v.optional(v.id('jobs')),
  },
  returns: v.id('items'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = await getLiveClient(ctx, args.clientId)
    if (client.isNoClient) fail('client.noClient')
    const job = args.jobId ? await getOwned(ctx, 'jobs', args.jobId) : null
    if (job && job.clientId !== client._id) fail('job.otherClient')
    const item = {
      businessId: ctx.business._id,
      clientId: client._id,
      name: requiredText(args.name, 'name', 120),
      extra: await mergeExtra(ctx, ctx.business._id, 'item', args.extra),
    }
    const itemId = await ctx.db.insert('items', {
      ...item,
      searchText: await itemSearchText(ctx, item),
    })
    await logActivity(ctx, {
      type: 'item.created',
      itemId,
      clientId: client._id,
      data: { name: item.name },
    })
    if (job) await setJobItems(ctx, job, [...job.itemIds, itemId])
    return itemId
  },
})

export const update = businessMutation({
  args: {
    itemId: v.id('items'),
    name: v.optional(v.string()),
    extra: v.optional(vExtra),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const item = await getOwned(ctx, 'items', args.itemId)
    const patch: Partial<Doc<'items'>> = {}
    if (args.name !== undefined)
      patch.name = requiredText(args.name, 'name', 120)
    if (args.extra !== undefined) {
      patch.extra = await mergeExtra(
        ctx,
        ctx.business._id,
        'item',
        args.extra,
        item.extra,
      )
    }
    patch.searchText = await itemSearchText(ctx, { ...item, ...patch })
    await ctx.db.patch('items', item._id, patch)
    await logActivity(ctx, {
      type: 'item.edited',
      itemId: item._id,
      clientId: item.clientId,
    })
    return null
  },
})

/** An item moves to another client; its job history (jobItems) stays with it. */
export const move = businessMutation({
  args: { itemId: v.id('items'), toClientId: v.id('clients') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const item = await getOwned(ctx, 'items', args.itemId)
    const to = await getLiveClient(ctx, args.toClientId)
    if (to.isNoClient) fail('client.noClient')
    if (to._id === item.clientId) return null
    await ctx.db.patch('items', item._id, { clientId: to._id })
    await logActivity(ctx, {
      type: 'item.moved',
      itemId: item._id,
      clientId: to._id,
      data: { fromId: item.clientId, toId: to._id },
    })
    return null
  },
})

/**
 * Everything the item page shows, history included. A Worker sees it only
 * through one of their jobs, and then only those jobs and their history (D89).
 */
export const get = businessQuery({
  // A string: the id comes from the address bar (see getOwnedFromUrl).
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const item = await getVisibleFromUrl(ctx, 'items', itemId)
    const worker = isWorker(ctx.member)
    const client = await ctx.db.get('clients', item.clientId)
    const links = await ctx.db
      .query('jobItems')
      .withIndex('by_item', (q) => q.eq('itemId', item._id))
      .collect()
    const lookups = newLookups()
    const jobs = []
    for (const link of links) {
      const job = await ctx.db.get('jobs', link.jobId)
      if (job && seesJob(ctx.member, job)) {
        jobs.push(await jobRow(ctx, job, lookups))
      }
    }
    jobs.sort((a, b) => b._creationTime - a._creationTime)
    const jobIds = new Set<string>(jobs.map((job) => job._id))
    const events = (
      await ctx.db
        .query('activity')
        .withIndex('by_item', (q) => q.eq('itemId', item._id))
        .collect()
    ).filter(
      (event) =>
        seesEvent(ctx.member, event) &&
        (!worker || (event.jobId !== undefined && jobIds.has(event.jobId))),
    )
    return {
      item,
      client: client && { _id: client._id, name: client.name },
      fields: await activeFields(ctx, ctx.business._id, 'item'),
      jobs,
      reminders: worker
        ? []
        : await openRemindersOn(ctx, ctx.business, { itemId: item._id }),
      timeline: await timeline(ctx, events),
    }
  },
})

/** A client's items, for linking them to a job: a Manager's job (D89). */
export const byClient = businessQuery({
  args: { clientId: v.id('clients') },
  returns: v.array(v.object({ _id: v.id('items'), name: v.string() })),
  handler: async (ctx, { clientId }) => {
    requireRole(ctx.member, 'manager')
    const client = await getOwned(ctx, 'clients', clientId)
    const items = await ctx.db
      .query('items')
      .withIndex('by_client', (q) => q.eq('clientId', client._id))
      .collect()
    return items.map(({ _id, name }) => ({ _id, name }))
  },
})
