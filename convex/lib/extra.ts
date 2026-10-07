import type { Infer } from 'convex/values'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { validateFieldValue } from '../../shared/fields'
import type { vExtra } from '../validators'
import { fail } from './errors'

type Extra = Infer<typeof vExtra>
type Target = Doc<'fields'>['target']

/**
 * Validates a record's extra field values. `incoming` replaces the active
 * fields' values as a whole: forms send every active field, and leaving one
 * out clears it. Values of archived fields are always kept, because archiving
 * hides and never deletes (D27).
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
    // A value saved earlier stays valid, e.g. long text after a change to text.
    const unchanged = fieldId in previous && previous[fieldId] === value
    if (!unchanged && !validateFieldValue(field, value)) {
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
