import { CalendarDotsIcon, SunIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { ListSection } from '#/components/list-section'
import { EmptyState, PageTitle } from '#/components/page'
import { AfterList, NowBlock, TodayLede } from '#/components/today/today-queue'
import { TodayWide } from '#/components/today/today-wide'
import { VisitRow } from '#/components/today/visit-row'
import { useNow } from '#/hooks/use-now'
import { useQueryKeepPrevious } from '#/hooks/use-query-keep-previous'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { m } from '#/paraglide/messages.js'
import { todayQueue } from '../../../shared/today'

export const Route = createFileRoute('/_app/')({
  staticData: { layout: 'wide' },
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

  const queue = data ? todayQueue(data, today, now) : undefined
  const waiting = queue ? (queue.first ? 1 : 0) + queue.rest.length : 0

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
        <TodayWide data={data} today={today} queue={queue} />
      ) : waiting + data.upcoming.length === 0 ? (
        <EmptyState
          icon={SunIcon}
          title={m.today_empty_title()}
          body={m.today_empty_body()}
        />
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
        </div>
      )}
    </>
  )
}
