import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { jobOwes } from '../shared/allocation'
import { canRegroupStage, canRemoveStage } from '../shared/stages'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import { moveJobToStage } from './lib/moveJob'
import { optionalText, requiredText } from './lib/validate'
import { vStageColor, vStageGroup } from './validators'

async function stagesOf(ctx: BusinessMutationCtx) {
  return await ctx.db
    .query('stages')
    .withIndex('by_business_order', (q) => q.eq('businessId', ctx.business._id))
    .collect()
}

async function jobsIn(ctx: BusinessMutationCtx, stage: Doc<'stages'>) {
  return await ctx.db
    .query('jobs')
    .withIndex('by_business_stage', (q) =>
      q.eq('businessId', ctx.business._id).eq('stageId', stage._id),
    )
    .collect()
}

export const add = businessMutation({
  args: {
    name: v.string(),
    group: vStageGroup,
    color: v.optional(vStageColor),
  },
  returns: v.id('stages'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const stages = await stagesOf(ctx)
    const name = requiredText(args.name, 'name', 40)
    // A new stage goes after the last stage of its group.
    const inGroup = stages.filter((stage) => stage.group === args.group)
    const after = inGroup.at(-1)?.order ?? stages.at(-1)?.order ?? -1
    for (const stage of stages) {
      if (stage.order > after) {
        await ctx.db.patch('stages', stage._id, { order: stage.order + 1 })
      }
    }
    const stageId = await ctx.db.insert('stages', {
      businessId: ctx.business._id,
      name,
      group: args.group,
      color: args.color ?? 'gray',
      order: after + 1,
      visibleToClient: false,
    })
    await logActivity(ctx, {
      type: 'stage.added',
      data: { name, toId: stageId },
    })
    return stageId
  },
})

/** Rename, recolour or regroup. Regrouping moves its jobs' group with it. */
export const update = businessMutation({
  args: {
    stageId: v.id('stages'),
    name: v.optional(v.string()),
    color: v.optional(vStageColor),
    group: v.optional(vStageGroup),
    clientName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const stage = await getOwned(ctx, 'stages', args.stageId)
    const patch: Partial<Doc<'stages'>> = {}
    if (args.name !== undefined)
      patch.name = requiredText(args.name, 'name', 40)
    if (args.color !== undefined) patch.color = args.color
    if (args.clientName !== undefined) {
      patch.clientName = optionalText(args.clientName, 'clientName', 40)
    }
    if (args.group !== undefined && args.group !== stage.group) {
      if (
        canRegroupStage(await stagesOf(ctx), stage._id, args.group) !== 'ok'
      ) {
        fail('stage.lastInGroup')
      }
      patch.group = args.group
      const now = Date.now()
      for (const job of await jobsIn(ctx, stage)) {
        await ctx.db.patch('jobs', job._id, {
          stageGroup: args.group,
          owes: jobOwes(job.balanceCents, args.group),
          doneAt: args.group === 'done' ? (job.doneAt ?? now) : undefined,
        })
      }
    }
    await ctx.db.patch('stages', stage._id, patch)
    await logActivity(ctx, {
      type: 'stage.edited',
      data: { from: stage.name, to: patch.name ?? stage.name, toId: stage._id },
    })
    return null
  },
})

export const reorder = businessMutation({
  args: { stageIds: v.array(v.id('stages')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    for (const stageId of args.stageIds) await getOwned(ctx, 'stages', stageId)
    const stages = await stagesOf(ctx)
    const ids = new Set<string>(args.stageIds)
    if (
      ids.size !== stages.length ||
      stages.some((stage) => !ids.has(stage._id))
    ) {
      fail('invalid', { field: 'stageIds' })
    }
    for (const [order, stageId] of args.stageIds.entries()) {
      await ctx.db.patch('stages', stageId, { order })
    }
    await logActivity(ctx, { type: 'stages.reordered' })
    return null
  },
})

/**
 * Deletes a stage. One holding jobs needs `moveJobsTo`, and New, In progress
 * and Done each keep at least one stage.
 */
export const remove = businessMutation({
  args: { stageId: v.id('stages'), moveJobsTo: v.optional(v.id('stages')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const stage = await getOwned(ctx, 'stages', args.stageId)
    const jobs = await jobsIn(ctx, stage)
    const target = args.moveJobsTo
      ? await getOwned(ctx, 'stages', args.moveJobsTo)
      : null
    if (target?._id === stage._id) fail('invalid', { field: 'moveJobsTo' })

    const check = canRemoveStage(
      await stagesOf(ctx),
      stage._id,
      target ? 0 : jobs.length,
    )
    if (check === 'lastInGroup') fail('stage.lastInGroup')
    if (check === 'hasJobs') fail('stage.hasJobs', { count: jobs.length })

    if (target) {
      for (const job of jobs) await moveJobToStage(ctx, job, target)
    }
    await ctx.db.delete('stages', stage._id)
    await logActivity(ctx, {
      type: 'stage.removed',
      data: { name: stage.name, fromId: stage._id, toId: target?._id },
    })
    return null
  },
})
