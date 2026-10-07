import {
  CalendarBlankIcon,
  CoinsIcon,
  FlagIcon,
  UserIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
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
      ? {
          icon: WarningCircleIcon,
          text: m.late_since({ date: formatDay(job.dueDate, today) }),
        }
      : job.nextAppointment
        ? {
            icon: CalendarBlankIcon,
            text: formatMoment(
              job.nextAppointment.start,
              job.nextAppointment.allDay,
              today,
            ),
          }
        : job.dueDate
          ? {
              icon: FlagIcon,
              text: m.due_short({ date: formatDay(job.dueDate, today) }),
            }
          : null
  const owes = job.owes && job.priceCents > 0
  const client = showClient && job.clientName

  return (
    <li>
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job._id }}
        className="flex flex-col gap-1.5 pressable px-4 py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-base leading-snug font-medium">
            {job.title}
          </span>
          {/* Pulled over the row's padding onto its top and right edges. */}
          <StageBadge
            name={job.stageName}
            group={job.stageGroup}
            corner
            className="-mt-3 -mr-4"
          />
        </div>
        {(client || timing || owes) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {client && (
              <Meta icon={UserIcon} className="min-w-0">
                <span className="truncate">{job.clientName}</span>
              </Meta>
            )}
            {timing && (
              <Meta
                icon={timing.icon}
                className={cn(late && 'font-medium text-destructive')}
              >
                {timing.text}
              </Meta>
            )}
            {owes && (
              <Meta icon={CoinsIcon} className="text-foreground/80">
                {m.balance_short({ amount: formatMoney(job.balanceCents) })}
              </Meta>
            )}
          </div>
        )}
      </Link>
    </li>
  )
}

function Meta({
  icon: IconComponent,
  className,
  children,
}: {
  icon: Icon
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <IconComponent aria-hidden className="size-4 shrink-0 opacity-80" />
      {children}
    </span>
  )
}
