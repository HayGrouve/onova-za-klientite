import { v } from 'convex/values'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import { cents, requiredText } from './lib/validate'

/** The active service list in order, while the Service list module is on. */
export const list = businessQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('services'),
      name: v.string(),
      priceCents: v.number(),
    }),
  ),
  handler: async (ctx) => {
    if (!ctx.business.modules.services) return []
    const services = await ctx.db
      .query('services')
      .withIndex('by_business_order', (q) =>
        q.eq('businessId', ctx.business._id),
      )
      .collect()
    return services
      .filter((service) => service.archivedAt === undefined)
      .map((service) => ({
        id: service._id,
        name: service.name,
        priceCents: service.priceCents,
      }))
  },
})

export const add = businessMutation({
  args: { name: v.string(), priceCents: v.number() },
  returns: v.id('services'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const services = await ctx.db
      .query('services')
      .withIndex('by_business_order', (q) =>
        q.eq('businessId', ctx.business._id),
      )
      .collect()
    const serviceId = await ctx.db.insert('services', {
      businessId: ctx.business._id,
      name: requiredText(args.name, 'name', 60),
      priceCents: cents(args.priceCents, 'priceCents'),
      order: (services.at(-1)?.order ?? -1) + 1,
    })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'services' },
    })
    return serviceId
  },
})

/** Rename, reprice, archive or restore. Archived services stay on old job lines. */
export const update = businessMutation({
  args: {
    serviceId: v.id('services'),
    name: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    archived: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const service = await getOwned(ctx, 'services', args.serviceId)
    await ctx.db.patch('services', service._id, {
      ...(args.name !== undefined
        ? { name: requiredText(args.name, 'name', 60) }
        : {}),
      ...(args.priceCents !== undefined
        ? { priceCents: cents(args.priceCents, 'priceCents') }
        : {}),
      ...(args.archived !== undefined
        ? {
            archivedAt: args.archived
              ? (service.archivedAt ?? Date.now())
              : undefined,
          }
        : {}),
    })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'services' },
    })
    return null
  },
})

export const reorder = businessMutation({
  args: { serviceIds: v.array(v.id('services')) },
  returns: v.null(),
  handler: async (ctx, { serviceIds }) => {
    requireRole(ctx.member, 'owner')
    for (const id of serviceIds) await getOwned(ctx, 'services', id)
    if (new Set(serviceIds).size !== serviceIds.length)
      fail('invalid', { field: 'serviceIds' })
    for (const [order, id] of serviceIds.entries())
      await ctx.db.patch('services', id, { order })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'services' },
    })
    return null
  },
})
