import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { jobOwedCents, jobOwes } from '../../shared/allocation'
import { boardColumn } from '../../shared/board'
import { enterGroup } from '../../shared/stages'

type Board = FunctionReturnType<typeof api.jobs.board>

/**
 * The board as it will be once a job is in another stage, for the optimistic
 * update: the job leaves its column and joins the stage's, and both columns'
 * counts and owed sums follow. Undefined when the board doesn't know the stage
 * or the job (then there is nothing to show early).
 */
export function moveOnBoard(
  board: Board,
  jobId: Id<'jobs'>,
  stageId: Id<'stages'>,
  now: number,
): Board | undefined {
  const stage = board.stages.find((item) => item._id === stageId)
  const moving = board.columns
    .flatMap((column) => column.jobs)
    .find((job) => job._id === jobId)
  if (!stage || !moving) return undefined
  // The same rule the server applies: Cancelled never owes, Done records when
  // it was reached.
  const moved = {
    ...moving,
    stageId: stage._id,
    stageName: stage.name,
    stageGroup: stage.group,
    owes: jobOwes(moving.balanceCents, stage.group),
    doneAt: enterGroup(moving, stage.group, now).doneAt,
  }
  return {
    ...board,
    columns: board.columns.map((column) => {
      const rest = column.jobs.filter((job) => job._id !== jobId)
      const left = rest.length < column.jobs.length
      const arrives = column.group === stage.group
      const jobs = arrives ? [...rest, moved] : rest
      return {
        ...column,
        jobs: boardColumn(column.group, jobs, jobs.length).jobs,
        olderOwing: column.olderOwing.filter((job) => job._id !== jobId),
        total: column.total - (left ? 1 : 0) + (arrives ? 1 : 0),
        owedCents:
          column.owedCents -
          (left ? jobOwedCents(moving) : 0) +
          (arrives ? jobOwedCents(moved) : 0),
      }
    }),
  }
}
