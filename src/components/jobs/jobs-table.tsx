import { Link, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import type { JobRowData } from '#/components/job-row'
import { formatMoment } from '#/components/job-row'
import { SortableHead, sortRows, useSort } from '#/components/sortable-head'
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
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { isOverdue } from '../../../shared/dates'
import { formatMoney, sumCents } from '../../../shared/money'

type SortKey =
  'title' | 'client' | 'stage' | 'due' | 'next' | 'price' | 'paid' | 'balance'

const SORT: Record<SortKey, (a: JobRowData, b: JobRowData) => number> = {
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
  balance: (a, b) => owed(a) - owed(b),
}

const owed = (job: JobRowData) => (job.owes ? job.balanceCents : 0)

/**
 * One stage group's jobs as a table on a wide screen: every column sorts, and
 * the money columns add up at the bottom. For looking back and doing the books.
 */
export function JobsTable({
  jobs,
  today,
}: {
  jobs: JobRowData[]
  today: string
}) {
  const { words } = useViewer().business
  const navigate = useNavigate()
  const [sort, onSort] = useSort<SortKey>()
  const rows = sortRows(jobs, sort, SORT)
  const head = (key: SortKey, label: string, numeric = false) => (
    <SortableHead
      column={key}
      label={label}
      sort={sort}
      onSort={onSort}
      numeric={numeric}
    />
  )

  return (
    <div className="mx-4 animate-rise overflow-hidden surface">
      <Table>
        <TableHeader className="bg-foreground/3">
          <TableRow className="hover:bg-transparent">
            {head('title', words.job.singular)}
            {head('client', words.client.singular)}
            {head('stage', m.job_stage())}
            {head('due', m.job_due())}
            {head('next', m.jobs_table_next())}
            {head('price', m.job_price(), true)}
            {head('paid', m.job_paid(), true)}
            {head('balance', m.job_balance(), true)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((job) => {
            const late =
              (job.stageGroup === 'new' || job.stageGroup === 'in_progress') &&
              isOverdue(job.dueDate, today)
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
                <TableCell className="max-w-72 px-4 py-3">
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: job._id }}
                    className="block truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {job.title}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56 truncate px-4 text-muted-foreground">
                  {job.isNoClient ? m.no_client() : job.clientName}
                </TableCell>
                <TableCell className="px-4">
                  <StageBadge name={job.stageName} group={job.stageGroup} />
                </TableCell>
                <TableCell
                  className={cn(
                    'px-4 first-letter:uppercase',
                    late
                      ? 'font-medium text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {job.dueDate ? formatDay(job.dueDate, today) : ''}
                </TableCell>
                <TableCell className="px-4 text-muted-foreground first-letter:uppercase">
                  {job.nextAppointment
                    ? formatMoment(
                        job.nextAppointment.start,
                        job.nextAppointment.allDay,
                        today,
                      )
                    : ''}
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums">
                  {formatMoney(job.priceCents)}
                </TableCell>
                <TableCell className="px-4 text-right text-muted-foreground tabular-nums">
                  {formatMoney(job.paidCents)}
                </TableCell>
                <TableCell
                  className={cn(
                    'px-4 text-right tabular-nums',
                    owed(job) > 0
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {owed(job) > 0 ? formatMoney(owed(job)) : '–'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter className="bg-foreground/3">
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5} className="px-4 py-3 font-medium">
              {m.count({ label: words.job.plural, count: rows.length })}
            </TableCell>
            <TableCell className="px-4 text-right font-semibold tabular-nums">
              {formatMoney(sumCents(rows.map((job) => job.priceCents)))}
            </TableCell>
            <TableCell className="px-4 text-right font-semibold tabular-nums">
              {formatMoney(sumCents(rows.map((job) => job.paidCents)))}
            </TableCell>
            <TableCell className="px-4 text-right font-semibold text-primary tabular-nums">
              {formatMoney(sumCents(rows.map(owed)))}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
