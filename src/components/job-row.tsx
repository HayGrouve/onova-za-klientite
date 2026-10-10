import {
  CalendarBlankIcon,
  CheckCircleIcon,
  FlagIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import { ListExtras } from '#/components/list-extras'
import { StageBadge } from '#/components/stage-badge'
import { useViewer } from '#/hooks/use-viewer'
import { markJobTitle } from '#/lib/morph'
import { formatDay, formatDayShort } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { dateInSofia } from '../../shared/dates'
import { formatMoney } from '../../shared/money'
import { isJobLate } from '../../shared/stages'

export type JobRowData = FunctionReturnType<
  typeof api.jobs.list
>['jobs'][number]

const TIME = new Intl.DateTimeFormat('bg-BG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

/** `short` is for a narrow table cell: the short day form, never a long date. */
export function formatMoment(
  ms: number,
  allDay: boolean,
  today: string,
  short = false,
) {
  const date = dateInSofia(ms)
  const day = short ? formatDayShort(date, today) : formatDay(date, today)
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

/**
 * A row's timing: what it leads with, shown before the client, then the rest.
 * `visit` is the next appointment when the row's one date is the job's due
 * date: it sits on its own line, labelled, so two dates never run together.
 */
function timingsOf(
  job: JobRowData,
  today: string,
  lead?: JobRowLead,
  showDone = false,
): { first?: Timing; rest: Timing[]; visit?: string } {
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
      return {
        rest: compact([late ?? due]),
        visit: next?.text,
      }
    case 'none':
      return { rest: [] }
    default:
      if (showDone && job.stageGroup === 'done' && job.doneAt) {
        const date = formatDay(dateInSofia(job.doneAt), today)
        return {
          rest: [{ icon: CheckCircleIcon, text: m.done_short({ date }) }],
        }
      }
      // Lateness comes first: an overdue job shows how late it is even with an appointment ahead.
      return { rest: compact([late ?? next ?? due]) }
  }
}

/** Why a row is on Today's queue, shown as a small dot in front of it (D119). */
export type JobRowReason = 'visit' | 'late' | 'soon' | 'unpaid'

const REASON_DOT: Record<JobRowReason, string> = {
  visit: 'bg-foreground/55',
  late: 'bg-destructive',
  soon: 'bg-soon',
  unpaid: 'bg-primary',
}

/**
 * One job in a list: the title with what is still owed beside it, then when,
 * the client and the stage. Each fact has its own place, so nothing is joined
 * into one long line.
 */
export function JobRow({
  job,
  today,
  showClient = true,
  lead,
  showDone = false,
  reason,
}: {
  job: JobRowData
  today: string
  showClient?: boolean
  lead?: JobRowLead
  /** A done job shows when it was done, as a history list needs. */
  showDone?: boolean
  /** On Today's queue: why the job is there, as a coloured dot. */
  reason?: JobRowReason
}) {
  const { words } = useViewer().business
  const timing = timingsOf(job, today, lead, showDone)
  const owes = job.owes && job.priceCents > 0
  const client = showClient && job.clientName
  const stage = <StageBadge name={job.stageName} group={job.stageGroup} />

  return (
    <li className="row-lazy">
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job._id }}
        viewTransition
        onClick={markJobTitle}
        className={cn(
          'relative flex flex-col gap-1 pressable px-4 py-3',
          reason && 'pl-9',
        )}
      >
        {reason && (
          <span
            aria-hidden
            className={cn(
              'absolute top-[1.3rem] left-4 size-2 rounded-full',
              REASON_DOT[reason],
            )}
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <span
            data-job-title
            className="min-w-0 text-[1.0625rem] leading-snug font-medium break-words"
          >
            {job.title}
          </span>
          {owes ? (
            <span className="shrink-0 pt-px text-[0.9375rem] tabular-nums">
              <span className="sr-only">{m.job_balance()}: </span>
              {formatMoney(job.balanceCents)}
            </span>
          ) : (
            stage
          )}
        </div>
        {(client || timing.first || timing.rest.length > 0 || owes) && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {timing.first && (
                <Meta
                  icon={timing.first.icon}
                  className="font-medium text-foreground"
                >
                  {timing.first.text}
                </Meta>
              )}
              {client && (
                <span className="max-w-full min-w-0 truncate">
                  {job.clientName}
                </span>
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
            </div>
            {owes && stage}
          </div>
        )}
        {timing.visit && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarBlankIcon
              aria-hidden
              className="size-4 shrink-0 opacity-80"
            />
            {m.job_next_appointment({
              appointment: words.appointment.singular,
              when: timing.visit,
            })}
          </div>
        )}
        <ListExtras target="job" values={job.listExtra} />
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
