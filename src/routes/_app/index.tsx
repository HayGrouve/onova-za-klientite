import { CalendarDotsIcon, SunIcon } from '@phosphor-icons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { ListSection } from '#/components/list-section'
import { EmptyState, PageTitle } from '#/components/page'
import { TodayCalendar } from '#/components/today/today-calendar'
import type { CalendarView } from '#/components/today/today-calendar'
import { AfterList, NowBlock, TodayLede } from '#/components/today/today-queue'
import { TodayWide } from '#/components/today/today-wide'
import { VisitRow } from '#/components/today/visit-row'
import { useNow } from '#/hooks/use-now'
import { useQueryKeepPrevious } from '#/hooks/use-query-keep-previous'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { m } from '#/paraglide/messages.js'
import { isValidDate, isValidMonth, monthOf } from '../../../shared/dates'
import { todayQueue } from '../../../shared/today'

export const Route = createFileRoute('/_app/')({
  staticData: { layout: 'wide' },
  // The calendar's month and day, so coming back from a job finds them (D125).
  validateSearch: (
    search: Record<string, unknown>,
  ): { month?: string; day?: string } => ({
    ...(typeof search.month === 'string' && isValidMonth(search.month)
      ? { month: search.month }
      : {}),
    ...(typeof search.day === 'string' && isValidDate(search.day)
      ? { day: search.day }
      : {}),
  }),
  component: TodayPage,
})

const LONG_DATE = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Sofia',
})

function TodayPage() {
  const { business } = useViewer()
  const today = useToday()
  const now = useNow()
  const data = useQueryKeepPrevious(api.today.list, {
    businessId: business._id,
    today,
    now,
  })
  const wide = useWide()
  const search = Route.useSearch()
  const navigate = useNavigate()

  const queue = data ? todayQueue(data, today, now) : undefined
  const waiting = queue ? (queue.first ? 1 : 0) + queue.rest.length : 0

  // Today's month and day unless another was picked. A day outside the month
  // (a URL typed by hand) gives way to the month's first.
  const day = search.day ?? today
  const month = search.month ?? monthOf(day)
  const view: CalendarView = {
    month,
    day: monthOf(day) === month ? day : `${month}-01`,
  }
  const calendar = (
    <TodayCalendar
      today={today}
      view={view}
      onView={(next) =>
        void navigate({
          to: '/',
          search:
            next.day === today && next.month === monthOf(today) ? {} : next,
          replace: true,
          resetScroll: false,
        })
      }
    />
  )

  return (
    <>
      <div className="px-4 pt-2">
        <span className="block text-sm font-medium text-muted-foreground first-letter:uppercase">
          {LONG_DATE.format(Date.now())}
        </span>
      </div>
      <PageTitle>{m.today_title()}</PageTitle>
      {!data || !queue ? (
        <ListSkeleton />
      ) : wide ? (
        <TodayWide
          data={data}
          today={today}
          queue={queue}
          calendar={calendar}
        />
      ) : waiting + data.upcoming.length === 0 ? (
        // Nothing this week, but the calendar may hold what comes later.
        <div className="flex flex-col gap-6">
          <EmptyState
            icon={SunIcon}
            title={m.today_empty_title()}
            body={m.today_empty_body()}
          />
          {calendar}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col">
            <TodayLede count={waiting} />
            {queue.first && <NowBlock entry={queue.first} today={today} />}
          </div>
          <AfterList entries={queue.rest} today={today} />
          {data.upcoming.length > 0 && (
            <ListSection
              title={m.today_upcoming()}
              icon={CalendarDotsIcon}
              count={data.upcoming.length}
            >
              {data.upcoming.map((item) => (
                <VisitRow key={item._id} item={item} today={today} />
              ))}
            </ListSection>
          )}
          {calendar}
        </div>
      )}
    </>
  )
}
