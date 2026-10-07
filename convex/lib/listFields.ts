import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

type Target = Doc<'fields'>['target']

/** The ids of a target's active fields marked "show in list". */
export async function listFieldIds(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  target: Target,
): Promise<Set<string>> {
  const fields = await ctx.db
    .query('fields')
    .withIndex('by_business_target_order', (q) =>
      q.eq('businessId', businessId).eq('target', target),
    )
    .collect()
  return new Set(
    fields
      .filter((field) => field.showInList && field.archivedAt === undefined)
      .map((field) => field._id),
  )
}

/** The part of a record's extra values that lists show, or nothing. */
export function listExtra(
  extra: Doc<'clients'>['extra'] | undefined,
  ids: Set<string>,
) {
  if (!extra || ids.size === 0) return undefined
  const picked = Object.fromEntries(
    Object.entries(extra).filter(([fieldId]) => ids.has(fieldId)),
  )
  return Object.keys(picked).length > 0 ? picked : undefined
}
