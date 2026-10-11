import {
  ClockIcon,
  HandCoinsIcon,
  HourglassMediumIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'
import type { JobRowData } from '#/components/job-row'
import { ListSection } from '#/components/list-section'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { formatDay } from '#/i18n/dates'
import { markJobTitle } from '#/lib/morph'
import { m } from '#/paraglide/messages.js'
import { dateInSofia } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'
import { isJobLate } from '../../../shared/stages'
import type { TodayEntry } from '../../../shared/today'

type TodayData = FunctionReturnType<typeof api.today.list>
type Visit = TodayData['appointments'][number]
type Reminder = TodayData['reminders'][number]
type Entry = TodayEntry<Visit, JobRowData, Reminder>

const TIME = new Intl.DateTimeFormat('bg-BG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

/**
 * The one line under the title: how many things wait, or that nothing does.
 * The block under it says which one is first, so this doesn't repeat it.
 */
export function TodayLede({ count }: { count: number }) {
  return (
    <p className="px-4 pb-4 text-[1.0625rem] leading-snug">
      {count === 0
        ? m.today_attention_clear()
        : m.count({ label: m.today_attention(), count })}
    </p>
  )
}

/**
 * "Now": the one thing to do first (D119), in the lichen block that is the
 * only large thing on Today. It opens the job, or is the reminder itself.
 */
export function NowBlock({ entry, today }: { entry: Entry; today: string }) {
  if (entry.kind === 'reminder') {
    const { reminder } = entry
    return (
      <section aria-label={m.today_now()} className="mx-4">
        <ul className="overflow-hidden rounded-2xl bg-accent">
          <ReminderRow
            reminderId={reminder._id}
            note={reminder.note}
            detail={[reminder.clientName, formatDay(reminder.date, today)]
              .filter(Boolean)
              .join(', ')}
            date={reminder.date}
            clientId={reminder.clientId}
            jobId={reminder.jobId}
            itemId={reminder.itemId}
          />
        </ul>
      </section>
    )
  }
  const job = entry.kind === 'visit' ? entry.visit.job : entry.job
  if (!job) return null
  const reason = reasonOf(entry, job, today)
  const lateSince = isJobLate(job, today) ? job.dueDate : undefined
  const owes = job.owes && job.priceCents > 0
  const ReasonIcon = reason.icon

  return (
    <section aria-label={m.today_now()} className="mx-4">
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job._id }}
        viewTransition
        onClick={markJobTitle}
        className="flex flex-col gap-1.5 rounded-2xl bg-accent p-4 transition-colors outline-none hover:bg-accent/80 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent/70"
      >
        <span
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium',
            reason.className,
          )}
        >
          <ReasonIcon aria-hidden className="size-4 shrink-0" weight="bold" />
          <span className="min-w-0">{reason.text}</span>
          {reason.label && (
            <span className="min-w-0 truncate font-normal text-muted-foreground">
              {reason.label}
            </span>
          )}
        </span>
        <span
          data-job-title
          className="text-[1.3125rem] leading-tight font-semibold tracking-[-0.01em] text-balance break-words"
        >
          {job.title}
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-muted-foreground">
            {job.isNoClient ? m.no_client() : job.clientName}
          </span>
          {owes && (
            <span className="shrink-0 text-[1.0625rem] tabular-nums">
              <span className="sr-only">{m.job_balance()}: </span>
              {formatMoney(job.balanceCents)}
            </span>
          )}
        </span>
        {/* A visit that is also overdue says so under it. */}
        {lateSince && entry.kind === 'visit' && (
          <span className="text-sm font-medium text-destructive">
            {m.late_since({ date: formatDay(lateSince, today) })}
          </span>
        )}
      </Link>
    </section>
  )
}

function reasonOf(
  entry: Exclude<Entry, { kind: 'reminder' }>,
  job: JobRowData,
  today: string,
): { icon: Icon; text: string; label?: string; className?: string } {
  if (entry.kind === 'visit') {
    const { visit } = entry
    const onToday = dateInSofia(visit.start) === today
    const text = !onToday
      ? formatDay(dateInSofia(visit.start), today)
      : visit.allDay
        ? m.today_now_all_day()
        : m.today_now_at({ time: TIME.format(visit.start) })
    return { icon: ClockIcon, text, label: visit.label }
  }
  switch (entry.reason) {
    case 'late':
      return {
        icon: WarningCircleIcon,
        text: m.late_since({ date: formatDay(job.dueDate ?? today, today) }),
        className: 'text-destructive',
      }
    case 'soon':
      return {
        icon: HourglassMediumIcon,
        text: m.due_short({ date: formatDay(job.dueDate ?? today, today) }),
        className: 'text-soon',
      }
    case 'unpaid':
      return { icon: HandCoinsIcon, text: m.today_reason_unpaid() }
  }
}

/** "After": the rest of the queue in one white surface, a dot per reason. */
export function AfterList({
  entries,
  today,
}: {
  entries: Entry[]
  today: string
}) {
  if (entries.length === 0) return null
  return (
    <ListSection title={m.today_next()} count={entries.length}>
      {entries.map((entry) => (
        <EntryRow key={keyOf(entry)} entry={entry} today={today} />
      ))}
    </ListSection>
  )
}

function keyOf(entry: Entry) {
  return entry.kind === 'visit'
    ? entry.visit._id
    : entry.kind === 'job'
      ? entry.job._id
      : entry.reminder._id
}

function EntryRow({ entry, today }: { entry: Entry; today: string }) {
  switch (entry.kind) {
    case 'visit':
      return entry.visit.job ? (
        <JobRow
          job={entry.visit.job}
          today={today}
          reason="visit"
          lead={{
            kind: 'appointment',
            start: entry.visit.start,
            allDay: entry.visit.allDay,
            label: entry.visit.label,
          }}
        />
      ) : null
    case 'job':
      return (
        <JobRow
          job={entry.job}
          today={today}
          reason={entry.reason}
          lead={entry.reason === 'unpaid' ? { kind: 'none' } : { kind: 'due' }}
        />
      )
    case 'reminder':
      return (
        <ReminderRow
          reminderId={entry.reminder._id}
          note={entry.reminder.note}
          detail={[
            entry.reminder.clientName,
            formatDay(entry.reminder.date, today),
          ]
            .filter(Boolean)
            .join(', ')}
          date={entry.reminder.date}
          clientId={entry.reminder.clientId}
          jobId={entry.reminder.jobId}
          itemId={entry.reminder.itemId}
        />
      )
  }
}
