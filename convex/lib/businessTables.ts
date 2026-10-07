import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

/** Every table that holds a business's data, with the index that starts with `businessId`. */
export const BUSINESS_TABLES = {
  clients: 'by_business_name',
  clientPhones: 'by_business_e164',
  items: 'by_business',
  stages: 'by_business_order',
  jobs: 'by_business_group_due',
  jobItems: 'by_business',
  appointments: 'by_business_start',
  services: 'by_business_order',
  reminders: 'by_business_status_date',
  payments: 'by_business_date',
  allocations: 'by_business',
  costs: 'by_business_date',
  fields: 'by_business_target_order',
  files: 'by_business',
  activity: 'by_business',
  messages: 'by_business',
  shareLinks: 'by_business',
  memberships: 'by_business_user',
} as const

export type BusinessTable = keyof typeof BUSINESS_TABLES

export const BUSINESS_TABLE_NAMES = Object.keys(
  BUSINESS_TABLES,
) as BusinessTable[]

/** A query over one table, limited to one business by its index. */
export function queryByBusiness<T extends BusinessTable>(
  ctx: QueryCtx,
  table: T,
  businessId: Id<'businesses'>,
) {
  // Each table's index differs, so the generic query builder can't type this.
  const query = ctx.db.query(table) as unknown as {
    withIndex: (
      index: string,
      range: (q: {
        eq: (field: 'businessId', value: Id<'businesses'>) => unknown
      }) => unknown,
    ) => {
      collect: () => Promise<Array<Doc<T>>>
      take: (n: number) => Promise<Array<Doc<T>>>
    }
  }
  return query.withIndex(BUSINESS_TABLES[table], (q) =>
    q.eq('businessId', businessId),
  )
}
