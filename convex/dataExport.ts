import { v } from 'convex/values'
import { businessQuery, requireRole } from './lib/auth'
import { BUSINESS_TABLE_NAMES, queryByBusiness } from './lib/businessTables'

/**
 * Everything the business holds, table by table (GDPR export). The browser
 * turns it into a zip: data.json plus one CSV per table. Owner only.
 */
export const all = businessQuery({
  args: {},
  returns: v.object({
    exportedAt: v.number(),
    business: v.any(),
    tables: v.record(v.string(), v.array(v.any())),
  }),
  handler: async (ctx) => {
    requireRole(ctx.member, 'owner')
    const tables: Record<string, unknown[]> = {}
    for (const table of BUSINESS_TABLE_NAMES) {
      const rows = await queryByBusiness(ctx, table, ctx.business._id).collect()
      tables[table] = await Promise.all(
        rows.map(async (row) =>
          'storageId' in row
            ? { ...row, url: await ctx.storage.getUrl(row.storageId) }
            : row,
        ),
      )
    }
    return { exportedAt: Date.now(), business: ctx.business, tables }
  },
})
