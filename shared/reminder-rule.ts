import type { StageGroup } from './stages'

/**
 * Q5: a job reaching Done offers the reminder rule's reminder, pre-filled. Not
 * for a job of the built-in No client: a reminder needs someone to follow up.
 */
export function offersRuleReminder(move: {
  from: StageGroup
  to: StageGroup
  remindersOn: boolean
  ruleOn: boolean
  isNoClient: boolean
}): boolean {
  return (
    move.to === 'done' &&
    move.from !== 'done' &&
    move.remindersOn &&
    move.ruleOn &&
    !move.isNoClient
  )
}
