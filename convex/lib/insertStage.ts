import type { Doc } from '../_generated/dataModel'
import type { StageDraft } from '../../shared/stages'
import type { BusinessMutationCtx } from './auth'

export async function businessStages(ctx: BusinessMutationCtx) {
  return await ctx.db
    .query('stages')
    .withIndex('by_business_order', (q) => q.eq('businessId', ctx.business._id))
    .collect()
}

/** Inserts a stage after the last stage of its group, shifting the rest down. */
export async function insertStage(
  ctx: BusinessMutationCtx,
  draft: StageDraft,
  stages?: Array<Doc<'stages'>>,
) {
  const current = stages ?? (await businessStages(ctx))
  const inGroup = current.filter((stage) => stage.group === draft.group)
  const after = inGroup.at(-1)?.order ?? current.at(-1)?.order ?? -1
  for (const stage of current) {
    if (stage.order > after) {
      await ctx.db.patch('stages', stage._id, { order: stage.order + 1 })
    }
  }
  return await ctx.db.insert('stages', {
    businessId: ctx.business._id,
    ...draft,
    order: after + 1,
    visibleToClient: false,
  })
}
