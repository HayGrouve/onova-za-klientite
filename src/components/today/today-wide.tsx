import { CalendarDotsIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { cn } from 'cn'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { JobRowData } from '#/components/job-row'
import { ListNote } from '#/components/list-section'
import { Panel, PanelList } from '#/components/panel'
import { StageBadge } from '#/components/stage-badge'
import { AfterList, NowBlock, TodayLede } from '#/components/today/today-queue'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { dateInSofia, monthOf } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'
import { jobOwedCents } from '../../../shared/allocation'
import { isJobLate } from '../../../shared/stages'
import type { todayQueue } from '../../../shared/today'
import { hasRole } from '../../../shared/roles'

type TodayData = FunctionReturnType<typeof api.today.list>
type AppointmentRow = TodayData['appointments'][number]
type Queue = ReturnType<
  typeof todayQueue<AppointmentRow, JobRowData, TodayData['reminders'][number]>
>

const TIME = new Intl.DateTimeFormat('bg-BG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

/**
 * Today on a wide screen: the same queue as the phone (D119), with the
 * schedule and the month's calendar (D125) beside it; the schedule when the
 * business keeps appointments. Visits live in the schedule, so the queue's
 * "After" leaves them out; the first thing to do may still be one. Lists to
 * act on, never charts (design doc, "Simple first").
 */
export function TodayWide({
  data,
  today,
  queue,
  calendar,
}: {
  data: TodayData
  today: string
  queue: Queue
  calendar: React.ReactNode
}) {
  const { modules } = useViewer().business
  const waiting = (queue.first ? 1 : 0) + queue.rest.length
  const after = modules.appointments
    ? queue.rest.filter((entry) => entry.kind !== 'visit')
    : queue.rest

  const focus = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <TodayLede count={waiting} />
        <MoneyLine today={today} />
        {queue.first && <NowBlock entry={queue.first} today={today} />}
      </div>
      <AfterList entries={after} today={today} />
    </div>
  )

  return (
    <div className="grid grid-cols-2 items-start gap-y-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      {focus}
      <div className="flex flex-col gap-6">
        {modules.appointments && <Schedule data={data} today={today} />}
        {calendar}
      </div>
    </div>
  )
}

/**
 * For managers, the month's money as one quiet line under the count: what
 * came in and what is still owed, each opening Money. A Worker sees no totals.
 */
function MoneyLine({ today }: { today: string }) {
  const { business } = useViewer()
  const seesMoney = hasRole(business.role, 'manager')
  const money = useQuery(
    api.money.headline,
    seesMoney ? { businessId: business._id, month: monthOf(today) } : 'skip',
  )
  if (!seesMoney || !money) return null
  const figure = (label: string, cents: number) => (
    <Link
      to="/money"
      className="flex items-baseline gap-2 rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">
        {formatMoney(cents)}
      </span>
    </Link>
  )
  return (
    <div className="-mt-2 flex flex-wrap gap-x-6 gap-y-1 px-4 pb-4 text-sm">
      {figure(m.today_received_month(), money.receivedCents)}
      {figure(m.money_still_owed(), money.stillOwedCents)}
    </div>
  )
}

/** Today hour by hour, then the next seven days, each under its day. */
function Schedule({ data, today }: { data: TodayData; today: string }) {
  const { words } = useViewer().business
  const days = new Map<string, AppointmentRow[]>()
  for (const item of data.upcoming) {
    const day = dateInSofia(item.start)
    days.set(day, [...(days.get(day) ?? []), item])
  }

  return (
    <Panel
      title={m.today_schedule()}
      icon={CalendarDotsIcon}
      count={data.appointments.length + data.upcoming.length}
    >
      <div id="schedule" className="flex scroll-mt-6 flex-col">
        <DayHeading>{formatDay(today, today)}</DayHeading>
        <PanelList>
          {data.appointments.map((item) => (
            <AgendaRow key={item._id} item={item} today={today} />
          ))}
          {data.appointments.length === 0 && (
            <ListNote>
              {m.today_none_today({ appointments: words.appointment.plural })}
            </ListNote>
          )}
        </PanelList>
        {[...days].map(([day, items]) => (
          <div key={day} className="flex flex-col">
            <DayHeading>{formatDay(day, today)}</DayHeading>
            <PanelList>
              {items.map((item) => (
                <AgendaRow key={item._id} item={item} today={today} />
              ))}
            </PanelList>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-t border-border/70 bg-foreground/3 px-4 py-1.5 text-xs font-semibold text-muted-foreground first-letter:uppercase">
      {children}
    </h3>
  )
}

/** One appointment in the schedule: its time, the job, label and client, the stage. */
function AgendaRow({ item, today }: { item: AppointmentRow; today: string }) {
  const { job } = item
  if (!job) return null
  const late = isJobLate(job, today)
  const owes = jobOwedCents(job) > 0
  return (
    <li>
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job._id }}
        className="relative flex items-center gap-4 pressable py-3 pr-4 pl-4"
      >
        <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
          {item.allDay ? m.all_day() : TIME.format(item.start)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The title keeps clear of the stage in the corner, unless the
              balance (shown from xl) already does. */}
          <span
            className={cn('line-clamp-2 pr-24 font-medium', owes && 'xl:pr-0')}
          >
            {job.title}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {[item.label, job.isNoClient ? m.no_client() : job.clientName]
              .filter(Boolean)
              .join(' · ')}
            {late && job.dueDate && (
              <span className="font-medium text-destructive">
                {' · '}
                {m.late_since({ date: formatDay(job.dueDate, today) })}
              </span>
            )}
          </span>
        </span>
        {owes && (
          <span className="hidden shrink-0 self-end text-sm text-muted-foreground tabular-nums xl:inline">
            {m.balance_short({ amount: formatMoney(job.balanceCents) })}
          </span>
        )}
        <StageBadge
          name={job.stageName}
          group={job.stageGroup}
          className="absolute top-2 right-4"
        />
      </Link>
    </li>
  )
}
