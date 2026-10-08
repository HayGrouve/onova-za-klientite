import { m } from '#/paraglide/messages.js'
import type { StageGroup } from '../../shared/stages'

export const GROUP_LABEL: Record<StageGroup, () => string> = {
  new: m.group_new,
  in_progress: m.group_in_progress,
  done: m.group_done,
  cancelled: m.group_cancelled,
}

/** What a group means for a job in it, in a line (Settings → Stages). */
export const GROUP_MEANING: Record<StageGroup, () => string> = {
  new: m.group_new_meaning,
  in_progress: m.group_in_progress_meaning,
  done: m.group_done_meaning,
  cancelled: m.group_cancelled_meaning,
}
