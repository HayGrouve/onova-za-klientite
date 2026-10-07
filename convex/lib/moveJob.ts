import type { Doc } from '../_generated/dataModel'
import { logActivity } from './activity'
import type { BusinessMutationCtx } from './auth'
import { recomputeJob } from './recompute'
import { optionalText } from './validate'

/** Shared by stage changes, cancelling and deleting a stage with "move jobs to". */
export async function moveJobToStage(
  ctx: BusinessMutationCtx,
  job: Doc<'jobs'>,
  stage: Doc<'stages'>,
  cancelReason?: string,
) {
  const from = await ctx.db.get('stages', job.stageId)
  const now = Date.now()
  await ctx.db.patch('jobs', job._id, {
    stageId: stage._id,
    stageGroup: stage.group,
    stageChangedAt: now,
    doneAt:
      stage.group === 'done'
        ? job.stageGroup === 'done'
          ? job.doneAt
          : now
        : undefined,
    cancelReason:
      stage.group === 'cancelled'
        ? (optionalText(cancelReason, 'cancelReason', 500) ?? job.cancelReason)
        : undefined,
  })
  await recomputeJob(ctx, job._id)
  await logActivity(ctx, {
    type: stage.group === 'cancelled' ? 'job.cancelled' : 'job.stageChanged',
    jobId: job._id,
    clientId: job.clientId,
    data: {
      from: from?.name,
      to: stage.name,
      fromId: job.stageId,
      toId: stage._id,
      note: stage.group === 'cancelled' ? cancelReason : undefined,
    },
  })
}
