import type { Infer } from 'convex/values'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { validateFieldValue } from '../../shared/fields'
import type { vExtra } from '../validators'
import { fail } from './errors'

type Extra = Infer<typeof vExtra>
type Target = Doc<'fields'>['target']

/**
 * Validates extra field values for a record and merges them over the old ones.
 * Values of archived fields are kept untouched: archiving hides, never deletes.
 */
export async function mergeExtra(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  target: Target,
  incoming: Extra | undefined,
  previous: Extra = {},
): Promise<Extra> {
  if (incoming === undefined) return previous
  const fields = await ctx.db
    .query('fields')
    .withIndex('by_business_target_order', (q) =>
      q.eq('businessId', businessId).eq('target', target),
    )
    .collect()
  const byId = new Map(fields.map((field) => [field._id as string, field]))

  const result: Extra = {}
  for (const [fieldId, value] of Object.entries(incoming)) {
    const field = byId.get(fieldId)
    if (!field || field.archivedAt !== undefined)
      fail('field.value', { fieldId })
    const unchanged = previous[fieldId] === value
    if (!validateFieldValue(field, value, { allowArchived: unchanged })) {
      fail('field.value', { fieldId })
    }
    result[fieldId] = value
  }
  for (const field of fields) {
    if (field.archivedAt !== undefined && field._id in previous) {
      result[field._id] = previous[field._id]
    }
  }
  return result
}
