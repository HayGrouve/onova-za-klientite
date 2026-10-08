import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { jobOwedCents, jobOwes } from '../../shared/allocation'
import { boardColumn } from '../../shared/board'
import { offersRuleReminder } from '../../shared/reminder-rule'
import { enterGroup } from '../../shared/stages'
import type { StageGroup } from '../../shared/stages'

type Stage = { _id: Id<'stages'>; name: string; group: StageGroup }

/**
 * Moves a job to another stage, from the job page or the board. The board
 * shows the move at once and settles when the server answers. Resolves to
 * true when the move reached Done and the reminder rule should be offered
 * (Q5, never for a No client job); a failure shows a toast and resolves to
 * false. `onMoved` runs once the server has taken the move, with that same
 * answer, for a caller that confirms the move (the job page's undo toast).
 */
export function useMoveJob() {
  const { business } = useViewer()
  const changeStage = useMutation(api.jobs.changeStage).withOptimisticUpdate(
    (store, { businessId, jobId, stageId }) => {
      const board = store.getQuery(api.jobs.board, { businessId })
      const stage = board?.stages.find((item) => item._id === stageId)
      const moving = board?.columns
        .flatMap((column) => column.jobs)
        .find((job) => job._id === jobId)
      if (!board || !stage || !moving) return
      // The same rule the server applies: Cancelled never owes, Done
      // records when it was reached.
      const moved = {
        ...moving,
        stageId: stage._id,
        stageName: stage.name,
        stageGroup: stage.group,
        owes: jobOwes(moving.balanceCents, stage.group),
        doneAt: enterGroup(moving, stage.group, Date.now()).doneAt,
      }
      store.setQuery(
        api.jobs.board,
        { businessId },
        {
          ...board,
          columns: board.columns.map((column) => {
            const rest = column.jobs.filter((job) => job._id !== jobId)
            const left = rest.length < column.jobs.length
            const arrives = column.group === stage.group
            const jobs = arrives ? [...rest, moved] : rest
            return {
              ...column,
              jobs: boardColumn(column.group, jobs, jobs.length).jobs,
              total: column.total - (left ? 1 : 0) + (arrives ? 1 : 0),
              owedCents:
                column.owedCents -
                (left ? jobOwedCents(moving) : 0) +
                (arrives ? jobOwedCents(moved) : 0),
            }
          }),
        },
      )
    },
  )
  const cancel = useMutation(api.jobs.cancel)

  return async (
    job: { _id: Id<'jobs'>; stageGroup: StageGroup; isNoClient: boolean },
    /** The stage, or Cancelled when the business has no Cancelled stage left. */
    target: Stage | 'cancelled',
    onMoved?: (offerRule: boolean) => void,
  ) => {
    try {
      if (target === 'cancelled') {
        await cancel({ businessId: business._id, jobId: job._id })
        onMoved?.(false)
        return false
      }
      await changeStage({
        businessId: business._id,
        jobId: job._id,
        stageId: target._id,
      })
      const offerRule = offersRuleReminder({
        from: job.stageGroup,
        to: target.group,
        remindersOn: business.modules.reminders,
        ruleOn: Boolean(business.reminderRule),
        isNoClient: job.isNoClient,
      })
      onMoved?.(offerRule)
      return offerRule
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }
}
