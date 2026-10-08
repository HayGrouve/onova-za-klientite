import { enterGroup } from '../../shared/stages'
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
    ...enterGroup(
      job,
      stage.group,
      now,
      optionalText(cancelReason, 'cancelReason', 500),
    ),
    stageId: stage._id,
    stageChangedAt: now,
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
