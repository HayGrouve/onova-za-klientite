import { m } from '#/paraglide/messages.js'
import type { StageGroup } from '../../shared/stages'

export const GROUP_LABEL: Record<StageGroup, () => string> = {
  new: m.group_new,
  in_progress: m.group_in_progress,
  done: m.group_done,
  cancelled: m.group_cancelled,
}
