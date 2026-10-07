import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  getOwnedFromUrl,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import { mergeExtra } from './lib/extra'
import { itemSearchText } from './lib/search'
import { requiredText } from './lib/validate'
import { jobRow, newLookups, timeline } from './lib/views'
import { vExtra } from './validators'

export const create = businessMutation({
  args: {
    clientId: v.id('clients'),
    name: v.string(),
    extra: v.optional(vExtra),
  },
  returns: v.id('items'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = await getOwned(ctx, 'clients', args.clientId)
    if (client.isNoClient) fail('client.noClient')
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
    const to = await getOwned(ctx, 'clients', args.toClientId)
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

/** Everything the item page shows, history included. */
export const get = businessQuery({
  // A string: the id comes from the address bar (see getOwnedFromUrl).
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const item = await getOwnedFromUrl(ctx, 'items', itemId)
    const client = await ctx.db.get('clients', item.clientId)
    const fields = await ctx.db
      .query('fields')
      .withIndex('by_business_target_order', (q) =>
        q.eq('businessId', ctx.business._id).eq('target', 'item'),
      )
      .collect()
    const links = await ctx.db
      .query('jobItems')
      .withIndex('by_item', (q) => q.eq('itemId', item._id))
      .collect()
    const lookups = newLookups()
    const jobs = []
    for (const link of links) {
      const job = await ctx.db.get('jobs', link.jobId)
      if (job) jobs.push(await jobRow(ctx, job, lookups))
    }
    jobs.sort((a, b) => b._creationTime - a._creationTime)
    const events = await ctx.db
      .query('activity')
      .withIndex('by_item', (q) => q.eq('itemId', item._id))
      .collect()
    return {
      item,
      client: client && { _id: client._id, name: client.name },
      fields: fields.filter((field) => field.archivedAt === undefined),
      jobs,
      timeline: await timeline(ctx, events),
    }
  },
})

/** A client's items, for linking them to a job. */
export const byClient = businessQuery({
  args: { clientId: v.id('clients') },
  returns: v.array(v.object({ _id: v.id('items'), name: v.string() })),
  handler: async (ctx, { clientId }) => {
    const client = await getOwned(ctx, 'clients', clientId)
    const items = await ctx.db
      .query('items')
      .withIndex('by_client', (q) => q.eq('clientId', client._id))
      .collect()
    return items.map(({ _id, name }) => ({ _id, name }))
  },
})
