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
import { dateInSofia } from '../../shared/dates'
import { formatMoney } from '../../shared/money'
import { isJobLate } from '../../shared/today'

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

/**
 * What a row leads with when its list has a reason for showing the job. Left
 * out, a row shows how late it is, else its next appointment, else its due date.
 * - `appointment`: that appointment's time and label, then how late the job is.
 * - `due`: how late it is, or its due date, then its next appointment.
 * - `none`: no timing at all, e.g. a done job whose list is about money.
 */
export type JobRowLead =
  | { kind: 'appointment'; start: number; allDay: boolean; label?: string }
  | { kind: 'due' }
  | { kind: 'none' }

type Timing = { icon: Icon; text: string; late?: boolean }

/** A row's timing: what it leads with, shown before the client, then the rest. */
function timingsOf(
  job: JobRowData,
  today: string,
  lead?: JobRowLead,
): { first?: Timing; rest: Timing[] } {
  const late: Timing | undefined =
    isJobLate(job, today) && job.dueDate
      ? {
          icon: WarningCircleIcon,
          text: m.late_since({ date: formatDay(job.dueDate, today) }),
          late: true,
        }
      : undefined
  const due: Timing | undefined = job.dueDate
    ? {
        icon: FlagIcon,
        text: m.due_short({ date: formatDay(job.dueDate, today) }),
      }
    : undefined
  const next: Timing | undefined = job.nextAppointment
    ? {
        icon: CalendarBlankIcon,
        text: formatMoment(
          job.nextAppointment.start,
          job.nextAppointment.allDay,
          today,
        ),
      }
    : undefined
  const compact = (timings: Array<Timing | undefined>) =>
    timings.filter((timing) => timing !== undefined)

  switch (lead?.kind) {
    case 'appointment': {
      // On today's date the day is known, so the time stands alone.
      const { start, allDay, label } = lead
      const when =
        dateInSofia(start) !== today
          ? formatMoment(start, allDay, today)
          : allDay
            ? m.all_day()
            : TIME.format(start)
      return {
        first: {
          icon: CalendarBlankIcon,
          text: label ? `${when} · ${label}` : when,
        },
        rest: compact([late]),
      }
    }
    case 'due':
      return { rest: compact([late ?? due, next]) }
    case 'none':
      return { rest: [] }
    default:
      // Lateness comes first: an overdue job shows how late it is even with an appointment ahead.
      return { rest: compact([late ?? next ?? due]) }
  }
}

/** One job in a list: title, client, stage, when, and what is still owed. */
export function JobRow({
  job,
  today,
  showClient = true,
  lead,
}: {
  job: JobRowData
  today: string
  showClient?: boolean
  lead?: JobRowLead
}) {
  const timing = timingsOf(job, today, lead)
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
        {(client || timing.first || timing.rest.length > 0 || owes) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {timing.first && (
              <Meta
                icon={timing.first.icon}
                className="font-medium text-foreground"
              >
                {timing.first.text}
              </Meta>
            )}
            {client && (
              <Meta icon={UserIcon} className="min-w-0">
                <span className="truncate">{job.clientName}</span>
              </Meta>
            )}
            {timing.rest.map((item) => (
              <Meta
                key={item.text}
                icon={item.icon}
                className={cn(item.late && 'font-medium text-destructive')}
              >
                {item.text}
              </Meta>
            ))}
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
