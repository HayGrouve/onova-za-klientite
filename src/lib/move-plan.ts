import type { StageGroup } from '../../shared/stages'

/** Where a job goes: a stage, or Cancelled when the business has no Cancelled stage left. */
type MoveTarget = { _id: string; group: StageGroup } | 'cancelled'

/** The group a move ends in. */
export function targetGroup(target: MoveTarget): StageGroup {
  return target === 'cancelled' ? 'cancelled' : target.group
}

/**
 * What to do with a move asked for on the board, given the job as it is now:
 * nothing (it is gone, or already in that stage), ask first (it would leave
 * the open work and stop counting as owed), or move at once. Run again when
 * the question is answered, so a job that moved meanwhile isn't moved from a
 * stale stage.
 */
export function planMove(
  current: { stageId: string; stageGroup: StageGroup } | undefined,
  target: MoveTarget,
): 'skip' | 'ask' | 'move' {
  if (!current) return 'skip'
  if (target !== 'cancelled' && target._id === current.stageId) return 'skip'
  if (targetGroup(target) === 'cancelled' && current.stageGroup !== 'cancelled')
    return 'ask'
  return 'move'
}
