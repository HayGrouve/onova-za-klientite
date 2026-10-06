import { SunIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'
import { ListSkeleton } from '#/components/list-skeleton'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { ListSection } from '#/components/list-section'
import { EmptyState, PageTitle } from '#/components/page'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/')({ component: TodayPage })

const LONG_DATE = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Sofia',
})

function TodayPage() {
  const { business } = useViewer()
  const today = useToday()
  const data = useQuery(api.today.list, { businessId: business._id, today })
  const { words } = business

  const empty =
    data &&
    data.appointments.length +
      data.upcoming.length +
      data.overdue.length +
      data.dueSoon.length +
      data.reminders.length +
      data.doneUnpaid.length ===
      0

  return (
    <>
      <div className="px-4 pt-2">
        <span className="text-sm text-muted-foreground">
          {LONG_DATE.format(Date.now())}
        </span>
      </div>
      <PageTitle>{m.today_title()}</PageTitle>
      {!data ? (
        <ListSkeleton />
      ) : empty ? (
        <EmptyState
          icon={SunIcon}
          title={m.today_empty_title()}
          body={m.today_empty_body()}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {data.appointments.length > 0 && (
            <ListSection
              title={m.today_appointments({
                appointments: words.appointment.plural,
              })}
            >
              {data.appointments.map(
                (item) =>
                  item.job && (
                    <JobRow
                      key={item._id}
                      job={{
                        ...item.job,
                        nextAppointment: {
                          start: item.start,
                          allDay: item.allDay,
                        },
                      }}
                      today={today}
                    />
                  ),
              )}
            </ListSection>
          )}
          {data.overdue.length > 0 && (
            <ListSection title={m.today_overdue()}>
              {data.overdue.map((job) => (
                <JobRow key={job._id} job={job} today={today} />
              ))}
            </ListSection>
          )}
          {data.dueSoon.length > 0 && (
            <ListSection title={m.today_due_soon()}>
              {data.dueSoon.map((job) => (
                <JobRow key={job._id} job={job} today={today} />
              ))}
            </ListSection>
          )}
          {data.reminders.length > 0 && (
            <ListSection title={m.today_reminders()}>
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
            <ListSection title={m.today_done_unpaid()}>
              {data.doneUnpaid.map((job) => (
                <JobRow key={job._id} job={job} today={today} />
              ))}
            </ListSection>
          )}
          {data.upcoming.length > 0 && (
            <ListSection title={m.today_upcoming()}>
              {data.upcoming.map(
                (item) =>
                  item.job && (
                    <JobRow
                      key={item._id}
                      job={{
                        ...item.job,
                        nextAppointment: {
                          start: item.start,
                          allDay: item.allDay,
                        },
                      }}
                      today={today}
                    />
                  ),
              )}
            </ListSection>
          )}
        </div>
      )}
    </>
  )
}
