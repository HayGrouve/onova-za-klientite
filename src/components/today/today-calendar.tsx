import {
  CalendarIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useEffect, useMemo, useRef } from 'react'
import { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'
import { ListNote } from '#/components/list-section'
import { Panel, PanelList } from '#/components/panel'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { Button, buttonVariants } from '#/components/ui/button'
import { useNow } from '#/hooks/use-now'
import { useQueryKeepPrevious } from '#/hooks/use-query-keep-previous'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { byDay, monthGrid, shiftMonth } from '../../../shared/calendar'
import { addDays, monthOf } from '../../../shared/dates'
import { hasRole } from '../../../shared/roles'
import { isJobLate } from '../../../shared/stages'

/** Which month the calendar shows and which of its days is open. */
export type CalendarView = { month: string; day: string }

// Noon UTC, formatted in UTC: the same calendar day in any device time zone.
const noon = (date: string) => new Date(`${date}T12:00:00Z`)

const MONTH = new Intl.DateTimeFormat('bg-BG', {
  month: 'long',
  timeZone: 'UTC',
})
const WEEKDAY = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'short',
  timeZone: 'UTC',
})
const FULL_DAY = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

// Monday to Sunday, from a week that started on a Monday.
const WEEKDAYS = Array.from({ length: 7 }, (_, n) =>
  WEEKDAY.format(noon(addDays('2026-10-05', n))),
)

/** How far each arrow key moves the picked day. */
const STEP: Partial<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
}

const DOT = {
  visit: 'bg-foreground/55',
  due: 'bg-soon',
  late: 'bg-destructive',
  reminder: 'bg-primary',
} as const

/**
 * A month on Today, for planning past the week the schedule lists (D125):
 * each day marks its visits, the open jobs due and the reminders, and the
 * picked day lists them under the month, with "+" for that day. Arrow keys
 * move the day; the month follows.
 */
export function TodayCalendar({
  today,
  view,
  onView,
}: {
  today: string
  view: CalendarView
  onView: (view: CalendarView) => void
}) {
  const { business } = useViewer()
  const { words, modules } = business
  const now = useNow()
  const data = useQueryKeepPrevious(api.calendar.month, {
    businessId: business._id,
    month: view.month,
    now,
  })
  const days = useMemo(() => (data ? byDay(data) : undefined), [data])
  const weeks = monthGrid(view.month)
  const thisMonth = monthOf(today)
  const canAdd = hasRole(business.role, 'manager') && view.day >= today

  const showMonth = (month: string) =>
    onView({ month, day: month === thisMonth ? today : `${month}-01` })

  // A day picked with the arrow keys takes the focus along.
  const grid = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${view.day}"]`)
      ?.focus()
  }, [view.day])
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = STEP[event.key]
    if (step === undefined) return
    event.preventDefault()
    const day = addDays(view.day, step)
    moved.current = true
    onView({ month: monthOf(day), day })
  }

  const picked = days?.get(view.day)
  // A job visited on the day is listed under its visit, not again as due.
  const visited = new Set(picked?.visits.map((visit) => visit.job?._id))
  const due = picked?.due.filter((job) => !visited.has(job._id)) ?? []
  const legend = [
    modules.appointments && { dot: DOT.visit, label: words.appointment.plural },
    { dot: DOT.due, label: m.calendar_due() },
    modules.reminders &&
      hasRole(business.role, 'manager') && {
        dot: DOT.reminder,
        label: m.calendar_reminders(),
      },
  ].filter((item) => item !== false)

  return (
    <Panel title={m.calendar_title()} icon={CalendarIcon}>
      <div className="flex items-center gap-1 border-t border-border/70 px-2 py-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label={m.calendar_prev()}
          onClick={() => showMonth(shiftMonth(view.month, -1))}
        >
          <CaretLeftIcon />
        </Button>
        <h3
          aria-live="polite"
          className="min-w-0 flex-1 text-center font-semibold first-letter:uppercase"
        >
          {MONTH.format(noon(`${view.month}-01`))} {view.month.slice(0, 4)}
        </h3>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label={m.calendar_next()}
          onClick={() => showMonth(shiftMonth(view.month, 1))}
        >
          <CaretRightIcon />
        </Button>
      </div>

      <div className="px-2 pb-2">
        <div
          aria-hidden
          className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-muted-foreground"
        >
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div ref={grid} onKeyDown={onKeyDown} className="flex flex-col">
          {weeks.map((week) => (
            <div key={week.find(Boolean)} className="grid grid-cols-7 gap-0.5">
              {week.map((day, index) =>
                day ? (
                  <DayCell
                    key={day}
                    day={day}
                    today={today}
                    selected={day === view.day}
                    marks={marksOf(days?.get(day), day, today)}
                    onPick={() => onView({ month: view.month, day })}
                  />
                ) : (
                  <span key={`blank-${index}`} />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('size-2 rounded-full', item.dot)}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-h-12 items-center gap-1 border-t border-border/70 bg-foreground/3 py-0.5 pr-2 pl-4">
        <h3 className="flex-1 text-sm font-semibold text-muted-foreground first-letter:uppercase">
          {formatDay(view.day, today)}
        </h3>
        {view.month !== thisMonth && (
          <Button
            variant="ghost"
            size="lg"
            className="h-11"
            onClick={() => onView({ month: thisMonth, day: today })}
          >
            {m.calendar_back_today()}
          </Button>
        )}
        {canAdd && (
          <Link
            to="/new"
            search={{ date: view.day }}
            aria-label={m.calendar_add_label({
              job: words.job.singular,
              day: FULL_DAY.format(noon(view.day)),
            })}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'h-11 px-3',
            )}
          >
            {m.calendar_add({ job: words.job.singular })}
          </Link>
        )}
      </div>
      <PanelList className="border-t-0">
        {!data ? (
          <ListNote>{m.loading()}</ListNote>
        ) : !picked ? (
          <ListNote>{m.calendar_day_empty()}</ListNote>
        ) : (
          <>
            {picked.visits.map((visit) =>
              visit.job ? (
                <JobRow
                  key={visit._id}
                  job={visit.job}
                  today={today}
                  reason="visit"
                  lead={{
                    kind: 'appointment',
                    start: visit.start,
                    allDay: visit.allDay,
                    label: visit.label,
                  }}
                />
              ) : null,
            )}
            {due.map((job) => (
              <JobRow
                key={job._id}
                job={job}
                today={today}
                reason={isJobLate(job, today) ? 'late' : 'soon'}
                lead={{ kind: 'due' }}
              />
            ))}
            {picked.reminders.map((reminder) => (
              <ReminderRow
                key={reminder._id}
                reminderId={reminder._id}
                note={reminder.note}
                detail={reminder.clientName ?? ''}
                date={reminder.date}
                clientId={reminder.clientId}
                jobId={reminder.jobId}
                itemId={reminder.itemId}
              />
            ))}
          </>
        )}
      </PanelList>
    </Panel>
  )
}

type Marks = { visits: number; due: number; late: boolean; reminders: number }

function marksOf(
  entry:
    { visits: unknown[]; due: unknown[]; reminders: unknown[] } | undefined,
  day: string,
  today: string,
): Marks {
  return {
    visits: entry?.visits.length ?? 0,
    due: entry?.due.length ?? 0,
    // Still open past its due date: the job is late.
    late: day < today,
    reminders: entry?.reminders.length ?? 0,
  }
}

function DayCell({
  day,
  today,
  selected,
  marks,
  onPick,
}: {
  day: string
  today: string
  selected: boolean
  marks: Marks
  onPick: () => void
}) {
  const { words } = useViewer().business
  const counts = [
    marks.visits > 0 &&
      m.count({ label: words.appointment.plural, count: marks.visits }),
    marks.due > 0 && m.count({ label: m.calendar_due(), count: marks.due }),
    marks.reminders > 0 &&
      m.count({ label: m.calendar_reminders(), count: marks.reminders }),
  ].filter(Boolean)
  return (
    <button
      type="button"
      data-day={day}
      tabIndex={selected ? 0 : -1}
      aria-pressed={selected}
      aria-current={day === today ? 'date' : undefined}
      aria-label={[FULL_DAY.format(noon(day)), ...counts].join(', ')}
      onClick={onPick}
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.9375rem] tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        day < today && 'text-muted-foreground',
        day === today && 'font-semibold text-primary',
        selected &&
          'bg-accent font-semibold text-accent-foreground hover:bg-accent',
      )}
    >
      {Number(day.slice(8))}
      <span aria-hidden className="flex h-1.5 gap-0.5">
        {marks.visits > 0 && (
          <span className={cn('size-1.5 rounded-full', DOT.visit)} />
        )}
        {marks.due > 0 && (
          <span
            className={cn(
              'size-1.5 rounded-full',
              marks.late ? DOT.late : DOT.due,
            )}
          />
        )}
        {marks.reminders > 0 && (
          <span className={cn('size-1.5 rounded-full', DOT.reminder)} />
        )}
      </span>
    </button>
  )
}
