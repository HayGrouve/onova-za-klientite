import { isOverdue } from './dates'

/** The four fixed buckets every stage belongs to. Lists and money read these, never stage names. */
export const STAGE_GROUPS = ['new', 'in_progress', 'done', 'cancelled'] as const

export type StageGroup = (typeof STAGE_GROUPS)[number]

/** New and In progress are open work; Done and Cancelled are closed. */
export function isOpenGroup(group: StageGroup): boolean {
  return group === 'new' || group === 'in_progress'
}

/** Overdue means late and still open: a Done or Cancelled job is never late. */
export function isJobLate(
  job: { stageGroup: StageGroup; dueDate?: string },
  today: string,
): boolean {
  return isOpenGroup(job.stageGroup) && isOverdue(job.dueDate, today)
}

/** "When did I last do this one?": when the latest of the jobs reached Done. */
export function lastDoneAt(
  jobs: ReadonlyArray<{ stageGroup: StageGroup; doneAt?: number }>,
): number | undefined {
  let latest: number | undefined
  for (const job of jobs) {
    if (
      job.stageGroup === 'done' &&
      job.doneAt !== undefined &&
      (latest === undefined || job.doneAt > latest)
    ) {
      latest = job.doneAt
    }
  }
  return latest
}

/**
 * What changes on a job when it enters a stage of `group`: when it reached
 * Done (kept on a move within Done) and its cancel reason (kept only in
 * Cancelled, a new one winning). Whether it owes follows from the group too:
 * see `jobOwes`. The one rule for a stage change, a cancel, a regrouped stage
 * and the board's instant move.
 */
export function enterGroup(
  job: { stageGroup: StageGroup; doneAt?: number; cancelReason?: string },
  group: StageGroup,
  now: number,
  cancelReason?: string,
) {
  return {
    stageGroup: group,
    doneAt:
      group === 'done'
        ? job.stageGroup === 'done'
          ? (job.doneAt ?? now)
          : now
        : undefined,
    cancelReason:
      group === 'cancelled' ? (cancelReason ?? job.cancelReason) : undefined,
  }
}

export const STAGE_COLORS = [
  'gray',
  'blue',
  'amber',
  'violet',
  'green',
  'red',
] as const

export type StageColor = (typeof STAGE_COLORS)[number]

export type StageDraft = { name: string; group: StageGroup; color: StageColor }

export type JobFlow = 'single' | 'multi'

/** Starting stages for a job flow (setup step 3). New, In progress and Done always get one each. */
export function stagesFor(flow: JobFlow): StageDraft[] {
  if (flow === 'single') {
    return [
      { name: 'Насрочено', group: 'new', color: 'blue' },
      { name: 'В работа', group: 'in_progress', color: 'amber' },
      { name: 'Готово', group: 'done', color: 'green' },
      { name: 'Отказано', group: 'cancelled', color: 'gray' },
    ]
  }
  return [
    { name: 'Запитване', group: 'new', color: 'blue' },
    { name: 'Оглед', group: 'in_progress', color: 'violet' },
    { name: 'В работа', group: 'in_progress', color: 'amber' },
    { name: 'Готово', group: 'done', color: 'green' },
    { name: 'Отказано', group: 'cancelled', color: 'gray' },
  ]
}

/** Groups that must always keep at least one stage. Cancelled may be empty. */
export const REQUIRED_GROUPS: readonly StageGroup[] = [
  'new',
  'in_progress',
  'done',
]

type StageLike<TId> = { _id: TId; group: StageGroup; order: number }

function isLastInGroup<TId>(
  stages: Array<StageLike<TId>>,
  stage: StageLike<TId>,
) {
  return (
    REQUIRED_GROUPS.includes(stage.group) &&
    stages.filter((other) => other.group === stage.group).length === 1
  )
}

/** Whether a stage can be deleted. A stage holding jobs must be emptied first. */
export function canRemoveStage<TId>(
  stages: Array<StageLike<TId>>,
  stageId: TId,
  jobCount: number,
): 'ok' | 'hasJobs' | 'lastInGroup' | 'notFound' {
  const stage = stages.find((item) => item._id === stageId)
  if (!stage) return 'notFound'
  if (isLastInGroup(stages, stage)) return 'lastInGroup'
  if (jobCount > 0) return 'hasJobs'
  return 'ok'
}

/** Whether a stage can move to another group without leaving its group empty. */
export function canRegroupStage<TId>(
  stages: Array<StageLike<TId>>,
  stageId: TId,
  group: StageGroup,
): 'ok' | 'lastInGroup' | 'notFound' {
  const stage = stages.find((item) => item._id === stageId)
  if (!stage) return 'notFound'
  if (stage.group === group) return 'ok'
  return isLastInGroup(stages, stage) ? 'lastInGroup' : 'ok'
}

/** The first stage of a group, in the business's stage order. */
export function firstStageOf<T extends StageLike<unknown>>(
  stages: T[],
  group: StageGroup,
): T | undefined {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .find((stage) => stage.group === group)
}

/** Where new jobs start: the first stage of the New group. */
export function defaultStage<T extends StageLike<unknown>>(
  stages: T[],
): T | undefined {
  return firstStageOf(stages, 'new')
}

/**
 * The stage ids in list order with each group kept together, New first:
 * the order the job page offers them in. `moved` (a stage just regrouped)
 * goes to the end of its group.
 */
export function groupedOrder<TId>(
  stages: Array<StageLike<TId>>,
  moved?: TId,
): TId[] {
  const rank = (stage: StageLike<TId>) =>
    stage._id === moved ? Number.POSITIVE_INFINITY : stage.order
  return [...stages]
    .sort(
      (a, b) =>
        STAGE_GROUPS.indexOf(a.group) - STAGE_GROUPS.indexOf(b.group) ||
        rank(a) - rank(b),
    )
    .map((stage) => stage._id)
}
