import {
  BellIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  HandCoinsIcon,
  HourglassMediumIcon,
  WalletIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'
import { ListNote, ListSection } from '#/components/list-section'
import { Panel, PanelList } from '#/components/panel'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { StageBadge } from '#/components/stage-badge'
import { StatTile } from '#/components/stat-tile'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { dateInSofia, monthOf } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'

type TodayData = FunctionReturnType<typeof api.today.list>
type AppointmentRow = TodayData['appointments'][number]

const TIME = new Intl.DateTimeFormat('bg-BG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

/**
 * Today on a wide screen: the headline figures in a row, then the schedule
 * (today hour by hour, the next days by day) beside what needs acting on.
 * Lists to act on, never charts (design doc, "Simple first").
 */
export function TodayWide({ data, today }: { data: TodayData; today: string }) {
  const { business, businesses } = useViewer()
  const { words, modules } = business
  const role = businesses.find((item) => item._id === business._id)?.role
  // Level 2: a Worker sees no totals, so the money tiles stay out.
  const seesMoney = role === 'owner' || role === 'manager'
  const money = useQuery(
    api.money.summary,
    seesMoney ? { businessId: business._id, month: monthOf(today) } : 'skip',
  )

  const attention =
    data.overdue.length +
    data.dueSoon.length +
    data.reminders.length +
    data.doneUnpaid.length
  const attentionLists = (
    <>
      {data.overdue.length > 0 && (
        <ListSection
          title={m.today_overdue()}
          icon={WarningCircleIcon}
          tone="danger"
          count={data.overdue.length}
        >
          {data.overdue.map((job) => (
            <JobRow key={job._id} job={job} today={today} />
          ))}
        </ListSection>
      )}
      {data.dueSoon.length > 0 && (
        <ListSection
          title={m.today_due_soon()}
          icon={HourglassMediumIcon}
          count={data.dueSoon.length}
        >
          {data.dueSoon.map((job) => (
            <JobRow key={job._id} job={job} today={today} />
          ))}
        </ListSection>
      )}
      {data.reminders.length > 0 && (
        <ListSection
          title={m.today_reminders()}
          icon={BellIcon}
          count={data.reminders.length}
        >
          {data.reminders.map((reminder) => (
            <ReminderRow
              key={reminder._id}
              reminderId={reminder._id}
              note={reminder.note}
              detail={[reminder.clientName, formatDay(reminder.date, today)]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </ListSection>
      )}
      {data.doneUnpaid.length > 0 && (
        <ListSection
          title={m.today_done_unpaid()}
          icon={HandCoinsIcon}
          count={data.doneUnpaid.length}
        >
          {data.doneUnpaid.map((job) => (
            <JobRow key={job._id} job={job} today={today} />
          ))}
        </ListSection>
      )}
      {attention === 0 && (
        <div className="mx-4 flex animate-rise items-center gap-3 surface p-4 text-sm text-muted-foreground">
          <CheckCircleIcon
            aria-hidden
            className="size-6 shrink-0 text-green-700"
            weight="duotone"
          />
          {m.today_attention_clear()}
        </div>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 px-4 xl:grid-cols-4">
        {modules.appointments && (
          <StatTile
            to="/"
            hash="schedule"
            icon={CalendarCheckIcon}
            label={m.today_appointments({
              appointments: words.appointment.plural,
            })}
            value={String(data.appointments.length)}
            detail={m.count({
              label: m.today_upcoming(),
              count: data.upcoming.length,
            })}
          />
        )}
        <StatTile
          to="/"
          hash="attention"
          icon={WarningCircleIcon}
          tone={data.overdue.length > 0 ? 'danger' : 'muted'}
          label={m.today_overdue()}
          value={String(data.overdue.length)}
          detail={m.count({
            label: m.today_due_soon(),
            count: data.dueSoon.length,
          })}
        />
        {seesMoney ? (
          <>
            <StatTile
              to="/money"
              icon={HandCoinsIcon}
              tone="primary"
              label={m.money_still_owed()}
              value={money ? formatMoney(money.stillOwedCents) : '…'}
              detail={m.count({
                label: m.today_done_unpaid(),
                count: data.doneUnpaid.length,
              })}
            />
            <StatTile
              to="/money"
              icon={WalletIcon}
              label={m.today_received_month()}
              value={money ? formatMoney(money.receivedCents) : '…'}
              detail={
                money && modules.costs
                  ? `${m.money_profit()}: ${formatMoney(money.profitCents)}`
                  : undefined
              }
            />
          </>
        ) : (
          <StatTile
            to="/"
            hash="attention"
            icon={HandCoinsIcon}
            label={m.today_done_unpaid()}
            value={String(data.doneUnpaid.length)}
          />
        )}
        {!modules.appointments && (
          <StatTile
            to="/"
            hash="attention"
            icon={BellIcon}
            label={m.today_reminders()}
            value={String(data.reminders.length)}
          />
        )}
      </div>

      {modules.appointments ? (
        <div className="grid grid-cols-2 items-start xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Schedule data={data} today={today} />
          <section
            id="attention"
            aria-label={m.today_attention()}
            className="flex scroll-mt-6 flex-col gap-5"
          >
            {attentionLists}
          </section>
        </div>
      ) : (
        <section
          id="attention"
          aria-label={m.today_attention()}
          className="grid scroll-mt-6 grid-cols-2 items-start gap-y-5"
        >
          {attentionLists}
        </section>
      )}
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
            <AgendaRow key={item._id} item={item} />
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
                <AgendaRow key={item._id} item={item} />
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

/** One appointment in the schedule: its time, the job and client, the stage. */
function AgendaRow({ item }: { item: AppointmentRow }) {
  const { job } = item
  if (!job) return null
  return (
    <li>
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job._id }}
        className="flex items-center gap-4 pressable px-4 py-3"
      >
        <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
          {item.allDay ? m.all_day() : TIME.format(item.start)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 font-medium">{job.title}</span>
          <span className="truncate text-sm text-muted-foreground">
            {[job.isNoClient ? m.no_client() : job.clientName, item.label]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {job.owes && job.balanceCents > 0 && (
          <span className="hidden shrink-0 text-sm text-muted-foreground tabular-nums xl:inline">
            {m.balance_short({ amount: formatMoney(job.balanceCents) })}
          </span>
        )}
        <StageBadge name={job.stageName} group={job.stageGroup} />
      </Link>
    </li>
  )
}
