import { useMutation } from 'convex/react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useStableCallback } from '#/hooks/use-stable-callback'
import { useViewer } from '#/hooks/use-viewer'
import { GROUP_LABEL } from '#/i18n/groups'
import { moveOnBoard } from '#/lib/board-move'
import { runChange } from '#/lib/change'
import { targetGroup } from '#/lib/move-plan'
import { m } from '#/paraglide/messages.js'
import { offersRuleReminder } from '../../shared/reminder-rule'
import type { StageGroup } from '../../shared/stages'

type Stage = { _id: Id<'stages'>; name: string; group: StageGroup }

/** The job as the move needs it, from a board card or the job page. */
type Moving = {
  _id: Id<'jobs'>
  title: string
  stageGroup: StageGroup
  isNoClient: boolean
  balanceCents: number
  /** The item the reminder rule's reminder is about, if the job has one. */
  itemId?: Id<'items'>
}

/** What the reminder rule's sheet needs to open. */
export type RuleOffer = { _id: Id<'jobs'>; title: string; itemId?: Id<'items'> }

/**
 * Moves a job to another stage, from the job page or the board, and says
 * where it went. The board shows the move at once and settles when the server
 * answers. `moveAndAnnounce` is the one flow for both: the move, the reminder
 * rule's offer when the job reaches Done (Q5, `ruleOffer` and `closeRuleOffer`
 * drive its sheet), and the toast with Undo, which waits while the offer is open.
 */
export function useMoveJob() {
  const { business } = useViewer()
  const changeStage = useMutation(api.jobs.changeStage).withOptimisticUpdate(
    (store, { businessId, jobId, stageId }) => {
      // Every cached board of this business, whatever `now` it was asked
      // with: the screen's clock may be a step ahead of the one a cached
      // result was read for.
      for (const { args, value } of store.getAllQueries(api.jobs.board)) {
        if (!value || args.businessId !== businessId) continue
        const moved = moveOnBoard(value, jobId, stageId, Date.now())
        if (moved) store.setQuery(api.jobs.board, args, moved)
      }
    },
  )
  const cancel = useMutation(api.jobs.cancel)

  /**
   * Moves the job. Resolves to whether it moved and whether the reminder
   * rule should be offered (Q5, never for a No client job). Offline or on a
   * failure it doesn't move and says why.
   */
  const move = async (
    job: Pick<Moving, '_id' | 'stageGroup' | 'isNoClient'>,
    /** The stage, or Cancelled when the business has no Cancelled stage left. */
    target: Stage | 'cancelled',
    /** Why, for a move into Cancelled (D121). */
    cancelReason?: string,
  ) => {
    const result = await runChange(() =>
      target === 'cancelled'
        ? cancel({
            businessId: business._id,
            jobId: job._id,
            ...(cancelReason ? { reason: cancelReason } : {}),
          })
        : changeStage({
            businessId: business._id,
            jobId: job._id,
            stageId: target._id,
            ...(cancelReason && target.group === 'cancelled'
              ? { cancelReason }
              : {}),
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

  const [ruleOffer, setRuleOffer] = useState<RuleOffer | null>(null)
  // The move's toast waits here while the offer's sheet covers the screen.
  const pending = useRef<{ jobId: Id<'jobs'>; say: () => void } | null>(null)

  /** The offer is done with (answered, skipped, or the move was undone). */
  const closeRuleOffer = useCallback(() => {
    setRuleOffer(null)
    const waiting = pending.current
    pending.current = null
    waiting?.say()
  }, [])

  /** Closes the offer of a job that left Done again, without its stale toast. */
  const dropRuleOffer = (jobId: Id<'jobs'>) => {
    if (pending.current?.jobId === jobId) pending.current = null
    setRuleOffer((open) => (open?._id === jobId ? null : open))
  }

  /**
   * Tells which stage the job is in now, with a way back to `previous`. One
   * toast at a time: a new move replaces the last. With `onPay`, reaching Done
   * with a balance also offers the payment.
   */
  const announce = (
    job: Moving,
    target: Stage | 'cancelled',
    previous: Stage | undefined,
    onPay?: () => void,
  ) => {
    const group = targetGroup(target)
    const undo = previous
      ? {
          label: m.undo(),
          onClick: () =>
            void move({ ...job, stageGroup: group }, previous).then(
              ({ moved }) => {
                if (moved) dropRuleOffer(job._id)
              },
            ),
        }
      : undefined
    const offerPayment =
      onPay !== undefined &&
      group === 'done' &&
      job.stageGroup !== 'done' &&
      job.balanceCents > 0
    toast.success(
      m.job_stage_moved({
        stage: target === 'cancelled' ? GROUP_LABEL.cancelled() : target.name,
      }),
      {
        id: STAGE_TOAST,
        duration: offerPayment ? 10_000 : 6000,
        ...(offerPayment
          ? { action: { label: m.pay_add(), onClick: onPay }, cancel: undo }
          : { action: undo }),
      },
    )
  }

  /**
   * Moves the job, then offers the reminder rule's reminder if it applies
   * (the toast follows once that is closed), or announces the move at once.
   * `previous` is the stage Undo goes back to; `onPay` adds the payment
   * button when Done leaves a balance, and `cancelReason` goes with a move
   * into Cancelled. Offline or on a failure nothing moves.
   */
  const moveAndAnnounce = useStableCallback(
    async (
      job: Moving,
      target: Stage | 'cancelled',
      previous: Stage | undefined,
      options: { onPay?: () => void; cancelReason?: string } = {},
    ) => {
      const { onPay, cancelReason } = options
      const { moved, offerRule } = await move(job, target, cancelReason)
      if (!moved) return
      const say = () => announce(job, target, previous, onPay)
      if (offerRule) {
        pending.current = { jobId: job._id, say }
        setRuleOffer({ _id: job._id, title: job.title, itemId: job.itemId })
      } else {
        say()
      }
    },
  )

  return { moveAndAnnounce, ruleOffer, closeRuleOffer }
}

/** One toast at a time for stage changes: a new one replaces the last. */
export const STAGE_TOAST = 'stage-moved'
