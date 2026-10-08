import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useViewer } from '#/hooks/use-viewer'
import { runChange } from '#/lib/change'
import { m } from '#/paraglide/messages.js'
import { jobOwedCents, jobOwes } from '../../shared/allocation'
import { boardColumn } from '../../shared/board'
import { offersRuleReminder } from '../../shared/reminder-rule'
import { enterGroup } from '../../shared/stages'
import type { StageGroup } from '../../shared/stages'

type Stage = { _id: Id<'stages'>; name: string; group: StageGroup }

/**
 * Moves a job to another stage, from the job page or the board. The board
 * shows the move at once and settles when the server answers. `announce`
 * says where the job went, with Undo, the same way on both.
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

  type Moving = {
    _id: Id<'jobs'>
    stageGroup: StageGroup
    isNoClient: boolean
  }

  /**
   * Moves the job. Resolves to whether it moved and whether the reminder
   * rule should be offered (Q5, never for a No client job). Offline or on a
   * failure it doesn't move and says why.
   */
  const move = async (
    job: Moving,
    /** The stage, or Cancelled when the business has no Cancelled stage left. */
    target: Stage | 'cancelled',
  ) => {
    const result = await runChange(() =>
      target === 'cancelled'
        ? cancel({ businessId: business._id, jobId: job._id })
        : changeStage({
            businessId: business._id,
            jobId: job._id,
            stageId: target._id,
          }),
    )
    return {
      moved: result.done,
      offerRule:
        result.done &&
        target !== 'cancelled' &&
        offersRuleReminder({
          from: job.stageGroup,
          to: target.group,
          remindersOn: business.modules.reminders,
          ruleOn: Boolean(business.reminderRule),
          isNoClient: job.isNoClient,
        }),
    }
  }

  /**
   * Tells which stage the job is in now, with a way back to `previous`. One
   * toast at a time: a new move replaces the last. With `onPay`, reaching Done
   * with a balance also offers the payment.
   */
  const announce = (
    job: Moving & { balanceCents: number },
    target: Stage,
    previous: Stage | undefined,
    onPay?: () => void,
  ) => {
    const undo = previous
      ? {
          label: m.undo(),
          onClick: () =>
            void move({ ...job, stageGroup: target.group }, previous),
        }
      : undefined
    const offerPayment =
      onPay !== undefined &&
      target.group === 'done' &&
      job.stageGroup !== 'done' &&
      job.balanceCents > 0
    toast.success(m.job_stage_moved({ stage: target.name }), {
      id: STAGE_TOAST,
      duration: offerPayment ? 10_000 : 6000,
      ...(offerPayment
        ? { action: { label: m.pay_add(), onClick: onPay }, cancel: undo }
        : { action: undo }),
    })
  }

  return { move, announce }
}

/** One toast at a time for stage changes: a new one replaces the last. */
export const STAGE_TOAST = 'stage-moved'
