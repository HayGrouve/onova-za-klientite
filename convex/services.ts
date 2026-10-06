import { v } from 'convex/values'
import { businessQuery } from './lib/auth'

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
