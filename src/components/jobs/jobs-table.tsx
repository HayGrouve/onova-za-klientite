import { Link, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import type { JobRowData } from '#/components/job-row'
import { formatMoment } from '#/components/job-row'
import { ScrollFade } from '#/components/scroll-fade'
import { SortableHead } from '#/components/sortable-head'
import { ListExtras } from '#/components/list-extras'
import { StageBadge } from '#/components/stage-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { useViewer } from '#/hooks/use-viewer'
import { formatDayShort } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { jobOwedCents } from '../../../shared/allocation'
import { isJobLate } from '../../../shared/stages'
import { formatMoney, sumCents } from '../../../shared/money'
import { sortRows } from '../../../shared/sort'
import type { Sort } from '../../../shared/sort'

export const JOB_SORT_KEYS = [
  'title',
  'client',
  'stage',
  'due',
  'next',
  'price',
  'paid',
  'balance',
] as const
export type JobSortKey = (typeof JOB_SORT_KEYS)[number]

const SORT: Record<JobSortKey, (a: JobRowData, b: JobRowData) => number> = {
  title: (a, b) => a.title.localeCompare(b.title, 'bg'),
  client: (a, b) => a.clientName.localeCompare(b.clientName, 'bg'),
  stage: (a, b) => a.stageName.localeCompare(b.stageName, 'bg'),
  // Undated rows go last either way round.
  due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  next: (a, b) =>
    (a.nextAppointment?.start ?? Infinity) -
    (b.nextAppointment?.start ?? Infinity),
  price: (a, b) => a.priceCents - b.priceCents,
  paid: (a, b) => a.paidCents - b.paidCents,
  balance: (a, b) => jobOwedCents(a) - jobOwedCents(b),
}

// Narrow screens drop what the books need least, so the money stays in view:
// the client moves under the title, and the next appointment goes (xl).
/** An amount, or a blank cell for none, in price, paid and balance alike. */
const money = (cents: number) => (cents === 0 ? '' : formatMoney(cents))

const WIDE_ONLY = 'hidden xl:table-cell'
const CELL = 'px-3 xl:px-4'

/**
 * Jobs as a table on a wide screen: every column sorts, and the money columns
 * add up at the bottom. The money sits right after the title, where a narrow
 * screen still shows it. For looking back and doing the books.
 */
export function JobsTable({
  jobs,
  today,
  sort,
  onSort,
}: {
  jobs: JobRowData[]
  today: string
  sort: Sort<JobSortKey>
  onSort: (key: JobSortKey, numeric: boolean) => void
}) {
  const { words } = useViewer().business
  const navigate = useNavigate()
  const rows = sortRows(jobs, sort, SORT)
  const head = (
    key: JobSortKey,
    label: string,
    {
      numeric = false,
      className,
    }: { numeric?: boolean; className?: string } = {},
  ) => (
    <SortableHead
      column={key}
      label={label}
      sort={sort}
      onSort={onSort}
      numeric={numeric}
      className={className}
    />
  )

  return (
    <ScrollFade className="mx-4 overflow-hidden surface">
      <Table>
        <TableHeader className="bg-foreground/3">
          <TableRow className="hover:bg-transparent">
            {head('title', words.job.singular)}
            {head('client', words.client.singular, { className: WIDE_ONLY })}
            {head('price', m.job_price(), { numeric: true })}
            {head('paid', m.job_paid(), { numeric: true })}
            {head('balance', m.job_balance(), { numeric: true })}
            {head('stage', m.job_stage())}
            {head('due', m.job_due())}
            {head('next', m.jobs_table_next(), { className: WIDE_ONLY })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((job) => {
            const late = isJobLate(job, today)
            const client = job.isNoClient ? m.no_client() : job.clientName
            return (
              <TableRow
                key={job._id}
                className="cursor-pointer"
                onClick={(event) => {
                  // The title is the real link; the rest of the row follows it.
                  if ((event.target as HTMLElement).closest('a')) return
                  void navigate({
                    to: '/jobs/$jobId',
                    params: { jobId: job._id },
                  })
                }}
              >
                <TableCell className={cn(CELL, 'max-w-52 py-3 xl:max-w-72')}>
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: job._id }}
                    title={job.title}
                    className="block truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {job.title}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground xl:hidden">
                    {client}
                  </span>
                  <ListExtras
                    target="job"
                    values={job.listExtra}
                    className="text-xs"
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    WIDE_ONLY,
                    'max-w-56 truncate px-4 text-muted-foreground',
                  )}
                  title={client || undefined}
                >
                  {client}
                </TableCell>
                <TableCell
                  className={cn(
                    CELL,
                    'text-right tabular-nums',
                    job.priceCents === 0 && 'text-muted-foreground',
                  )}
                >
                  {money(job.priceCents)}
                </TableCell>
                <TableCell
                  className={cn(
                    CELL,
                    'text-right text-muted-foreground tabular-nums',
                  )}
                >
                  {money(job.paidCents)}
                </TableCell>
                <TableCell
                  className={cn(
                    CELL,
                    'text-right tabular-nums',
                    jobOwedCents(job) > 0
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {money(jobOwedCents(job))}
                </TableCell>
                <TableCell className={CELL}>
                  <StageBadge name={job.stageName} group={job.stageGroup} />
                </TableCell>
                <TableCell
                  className={cn(
                    CELL,
                    'first-letter:uppercase',
                    late
                      ? 'font-medium text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {job.dueDate ? formatDayShort(job.dueDate, today) : ''}
                </TableCell>
                <TableCell
                  className={cn(
                    WIDE_ONLY,
                    'px-4 text-muted-foreground first-letter:uppercase',
                  )}
                >
                  {job.nextAppointment
                    ? formatMoment(
                        job.nextAppointment.start,
                        job.nextAppointment.allDay,
                        today,
                        true,
                      )
                    : ''}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter className="bg-foreground/3">
          <TableRow className="hover:bg-transparent">
            <TableCell className={cn(CELL, 'py-3 font-medium')}>
              {m.count({ label: words.job.plural, count: rows.length })}
            </TableCell>
            <TableCell className={WIDE_ONLY} />
            <TableCell
              className={cn(CELL, 'text-right font-semibold tabular-nums')}
            >
              {formatMoney(sumCents(rows.map((job) => job.priceCents)))}
            </TableCell>
            <TableCell
              className={cn(CELL, 'text-right font-semibold tabular-nums')}
            >
              {formatMoney(sumCents(rows.map((job) => job.paidCents)))}
            </TableCell>
            <TableCell
              className={cn(
                CELL,
                'text-right font-semibold text-primary tabular-nums',
              )}
            >
              {formatMoney(sumCents(rows.map(jobOwedCents)))}
            </TableCell>
            <TableCell colSpan={2} />
            <TableCell className={WIDE_ONLY} />
          </TableRow>
        </TableFooter>
      </Table>
    </ScrollFade>
  )
}
