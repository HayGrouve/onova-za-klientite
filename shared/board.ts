import { jobOwedCents } from './allocation'
import { monthOf } from './dates'
import { foldName, nameMatches } from './search'
import { textParam } from './sort'
import { isOpenGroup } from './stages'
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
    isOpenGroup(group)
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
    jobs: isOpenGroup(group) ? sorted : sorted.slice(0, closedLimit),
    total: jobs.length,
    owedCents: owedCents(jobs),
  }
}

/** What the jobs still owe: the balances of those that owe. */
export function owedCents(
  jobs: ReadonlyArray<Pick<BoardJob, 'owes' | 'balanceCents'>>,
) {
  return jobs.reduce((sum, item) => sum + jobOwedCents(item), 0)
}

/** What the jobs filter reads from a job (a board card or a table row). */
export type FilterableJob = {
  title: string
  clientName: string
  isNoClient: boolean
  stageName: string
  dueDate?: string
  owes: boolean
  balanceCents: number
}

/**
 * The jobs filter on a wide screen, shared by the board and the table: some
 * words, and two yes/no chips. Everything switched on has to hold.
 */
export type JobFilter = {
  /** Words that start words of the title, the client or the stage name. */
  text?: string
  /** Only jobs that still owe a balance. */
  owing?: boolean
  /** Only jobs whose due date falls in the current Sofia calendar month. */
  dueThisMonth?: boolean
}

/** The filter as the jobs list's address holds it, so Back returns to it. */
export type JobFilterSearch = { q?: string; owing?: true; due?: 'month' }

/** The filter's part of an address, with anything it doesn't know left out. */
export function parseFilterSearch(
  search: Record<string, unknown>,
): JobFilterSearch {
  const q = textParam(search.q)
  return {
    ...(q !== undefined && { q }),
    ...(search.owing === true && { owing: true as const }),
    ...(search.due === 'month' && { due: 'month' as const }),
  }
}

export function filterFromSearch(search: JobFilterSearch): JobFilter {
  return {
    text: search.q,
    owing: search.owing,
    dueThisMonth: search.due === 'month',
  }
}

export function filterToSearch(filter: JobFilter): JobFilterSearch {
  return {
    ...(hasText(filter.text) && { q: filter.text }),
    ...(filter.owing && { owing: true as const }),
    ...(filter.dueThisMonth && { due: 'month' as const }),
  }
}

const hasText = (text: string | undefined): text is string =>
  text !== undefined && foldName(text) !== ''

export function isFiltering({ text, owing, dueThisMonth }: JobFilter) {
  return hasText(text) || owing === true || dueThisMonth === true
}

/** The jobs that pass `filter`, in their order. `today` is the Sofia date. */
export function filterJobs<T extends FilterableJob>(
  jobs: T[],
  filter: JobFilter,
  today: string,
): T[] {
  if (!isFiltering(filter)) return jobs
  const month = monthOf(today)
  return jobs.filter(
    (job) =>
      (!hasText(filter.text) ||
        nameMatches(
          filter.text,
          `${job.title} ${job.isNoClient ? '' : job.clientName} ${job.stageName}`,
        )) &&
      (!filter.owing || jobOwedCents(job) > 0) &&
      (!filter.dueThisMonth ||
        (job.dueDate !== undefined && monthOf(job.dueDate) === month)),
  )
}
