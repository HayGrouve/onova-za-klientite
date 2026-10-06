import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import { StageBadge } from '#/components/stage-badge'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { dateInSofia, isOverdue } from '../../shared/dates'
import { formatMoney } from '../../shared/money'

export type JobRowData = FunctionReturnType<
  typeof api.jobs.list
>['jobs'][number]

const TIME = new Intl.DateTimeFormat('bg-BG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

export function formatMoment(ms: number, allDay: boolean, today: string) {
  const day = formatDay(dateInSofia(ms), today)
  return allDay ? day : `${day}, ${TIME.format(ms)}`
}

/** One job in a list: title, client, stage, when, and what is still owed. */
export function JobRow({
  job,
  today,
  showClient = true,
}: {
  job: JobRowData
  today: string
  showClient?: boolean
}) {
  const late =
    (job.stageGroup === 'new' || job.stageGroup === 'in_progress') &&
    isOverdue(job.dueDate, today)
  // Lateness comes first: an overdue job shows how late it is even with an appointment ahead.
  const timing =
    late && job.dueDate
      ? m.late_since({ date: formatDay(job.dueDate, today) })
      : job.nextAppointment
        ? formatMoment(
            job.nextAppointment.start,
            job.nextAppointment.allDay,
            today,
          )
        : job.dueDate
          ? m.due_short({ date: formatDay(job.dueDate, today) })
          : null

  return (
    <li>
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job._id }}
        className="flex flex-col gap-1 rounded-2xl px-4 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-base leading-snug font-medium">
            {job.title}
          </span>
          <StageBadge name={job.stageName} color={job.stageColor} />
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
          <span className="truncate">{showClient ? job.clientName : ''}</span>
          {timing && (
            <span
              className={cn('shrink-0', late && 'font-medium text-destructive')}
            >
              {timing}
            </span>
          )}
        </div>
        {job.owes && job.priceCents > 0 && (
          <span className="text-sm text-muted-foreground">
            {m.balance_short({ amount: formatMoney(job.balanceCents) })}
          </span>
        )}
      </Link>
    </li>
  )
}
