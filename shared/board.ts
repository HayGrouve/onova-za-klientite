import type { StageGroup } from './stages'

/** What the board needs to order and sum a job. */
export type BoardJob = {
  _creationTime: number
  stageGroup: StageGroup
  dueDate?: string
  doneAt?: number
  owes: boolean
  balanceCents: number
}

/** Done and Cancelled keep growing, so the board shows only the latest of them. */
export const BOARD_CLOSED_LIMIT = 20

const OPEN: ReadonlySet<StageGroup> = new Set(['new', 'in_progress'])

/**
 * One column of the board: the jobs of one stage group in board order, how
 * many there are, and what they still owe. Open work comes soonest due first,
 * then undated work newest first; closed work comes most recently finished
 * first and is cut to `closedLimit`.
 */
export function boardColumn<T extends BoardJob>(
  group: StageGroup,
  jobs: T[],
  closedLimit = BOARD_CLOSED_LIMIT,
) {
  const sorted = [...jobs].sort(
    OPEN.has(group)
      ? (a, b) =>
          a.dueDate && b.dueDate
            ? a.dueDate.localeCompare(b.dueDate) ||
              b._creationTime - a._creationTime
            : a.dueDate
              ? -1
              : b.dueDate
                ? 1
                : b._creationTime - a._creationTime
      : (a, b) => (b.doneAt ?? b._creationTime) - (a.doneAt ?? a._creationTime),
  )
  return {
    jobs: OPEN.has(group) ? sorted : sorted.slice(0, closedLimit),
    total: jobs.length,
    owedCents: jobs.reduce(
      (sum, item) => (item.owes ? sum + item.balanceCents : sum),
      0,
    ),
  }
}
