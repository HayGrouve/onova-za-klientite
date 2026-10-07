import {
  CaretLeftIcon,
  ChatCircleIcon,
  ClipboardTextIcon,
  PhoneIcon,
  SunIcon,
  UsersIcon,
  WifiSlashIcon,
} from '@phosphor-icons/react'
import { cn } from 'cn'
import { useState } from 'react'
import { StageBadge } from '#/components/stage-badge'
import { Button, buttonVariants } from '#/components/ui/button'
import { formatDay } from '#/i18n/dates'
import type { SavedSnapshot, Snapshot } from '#/lib/offline-store'
import { m } from '#/paraglide/messages.js'
import { dateInSofia, isOverdue, todayInSofia } from '../../../shared/dates'
import { formatMoney, lineTotalCents } from '../../../shared/money'
import { formatPhone, telHref, viberHref } from '../../../shared/phone'

type Job = Snapshot['jobs'][number]
type Client = Snapshot['clients'][number]
type View =
  { tab: 'today' | 'jobs' | 'clients' } | { job: Job } | { client: Client }

const TIME = new Intl.DateTimeFormat('bg-BG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})
const SAVED = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

function JobLine({
  job,
  today,
  onOpen,
}: {
  job: Job
  today: string
  onOpen: () => void
}) {
  const late = isOverdue(job.dueDate, today)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-1 rounded-2xl px-4 py-3 text-left hover:bg-muted/60"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-medium">{job.title}</span>
          <StageBadge name={job.stageName} color={job.stageColor} />
        </span>
        <span className="flex justify-between gap-3 text-sm text-muted-foreground">
          <span className="truncate">{job.clientName}</span>
          {job.dueDate && (
            <span className={cn(late && 'font-medium text-destructive')}>
              {late
                ? m.late_since({ date: formatDay(job.dueDate, today) })
                : m.due_short({ date: formatDay(job.dueDate, today) })}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/**
 * The read-only app for a cold start with no signal (ADR 0010): today's
 * appointments, open jobs with their details and client contacts, from the
 * last saved snapshot. Clerk can't load offline, so it doesn't wait for auth.
 */
export function OfflineApp({ saved }: { saved: SavedSnapshot | null }) {
  const [view, setView] = useState<View>({ tab: 'today' })
  if (!saved) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiSlashIcon className="size-10 text-muted-foreground" />
        <p>{m.offline_no_snapshot()}</p>
        <Button size="xl" onClick={() => window.location.reload()}>
          {m.offline_retry()}
        </Button>
      </div>
    )
  }
  const { data } = saved
  const today = todayInSofia(Date.now())
  const jobsById = new Map(data.jobs.map((job) => [job._id as string, job]))
  const clientsById = new Map(
    data.clients.map((client) => [client._id as string, client]),
  )
  const todays = data.appointments.filter(
    (item) => dateInSofia(item.start) === today,
  )
  const back = (
    <Button
      variant="ghost"
      className="h-11 w-fit"
      onClick={() => setView({ tab: 'today' })}
    >
      <CaretLeftIcon data-icon="inline-start" />
      {m.offline_back()}
    </Button>
  )

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-24">
      <header className="flex flex-col gap-1 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <span className="text-sm font-medium">{data.businessName}</span>
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900"
        >
          <WifiSlashIcon className="size-5 shrink-0" />
          <span>
            {m.offline_edit_blocked()}{' '}
            {m.offline_updated({ when: SAVED.format(saved.savedAt) })}
          </span>
        </div>
      </header>

      {'job' in view ? (
        <section className="flex flex-col gap-3 px-4">
          {back}
          <h1 className="text-2xl font-semibold">{view.job.title}</h1>
          <StageBadge
            name={view.job.stageName}
            color={view.job.stageColor}
            className="w-fit"
          />
          {clientsById.get(view.job.clientId) && (
            <button
              type="button"
              className="w-fit text-left font-medium text-primary"
              onClick={() =>
                setView({ client: clientsById.get(view.job.clientId)! })
              }
            >
              {view.job.clientName}
            </button>
          )}
          {view.job.address && (
            <p className="text-sm text-muted-foreground">{view.job.address}</p>
          )}
          <ul className="flex flex-col text-sm">
            {view.job.lines.map((line, index) => (
              <li key={index} className="flex justify-between gap-3 py-1">
                <span>
                  {line.description} · {String(line.quantity).replace('.', ',')}{' '}
                  × {formatMoney(line.unitPriceCents)}
                </span>
                <span>
                  {formatMoney(
                    lineTotalCents(line.quantity, line.unitPriceCents),
                  )}
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[
              [m.job_price(), view.job.priceCents],
              [m.job_paid(), view.job.paidCents],
              [m.job_balance(), view.job.balanceCents],
            ].map(([label, cents]) => (
              <div key={label} className="rounded-2xl bg-muted p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold">
                  {formatMoney(cents as number)}
                </dd>
              </div>
            ))}
          </dl>
          {view.job.notes && (
            <p className="text-sm whitespace-pre-wrap">{view.job.notes}</p>
          )}
        </section>
      ) : 'client' in view ? (
        <section className="flex flex-col gap-3 px-4">
          {back}
          <h1 className="text-2xl font-semibold">
            {view.client.isNoClient ? m.no_client() : view.client.name}
          </h1>
          {view.client.phones.map((phone) => (
            <div key={phone} className="flex gap-2">
              <a
                href={telHref(phone)}
                className={buttonVariants({ size: 'xl', className: 'flex-1' })}
              >
                <PhoneIcon data-icon="inline-start" />
                {formatPhone(phone)}
              </a>
              <a
                href={viberHref(phone)}
                aria-label={m.client_viber()}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'icon-xl',
                })}
              >
                <ChatCircleIcon />
              </a>
            </div>
          ))}
          {view.client.email && <p className="text-sm">{view.client.email}</p>}
          {view.client.address && (
            <p className="text-sm">{view.client.address}</p>
          )}
          {view.client.note && (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {view.client.note}
            </p>
          )}
        </section>
      ) : view.tab === 'today' ? (
        <ul className="flex flex-col">
          {todays.map((item) => {
            const job = item.jobId ? jobsById.get(item.jobId) : undefined
            return (
              <li key={item._id}>
                <button
                  type="button"
                  disabled={!job}
                  onClick={() => job && setView({ job })}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-muted/60"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {job?.title ?? item.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {job?.clientName}
                    </span>
                  </span>
                  <span className="text-sm">
                    {item.allDay ? m.all_day() : TIME.format(item.start)}
                  </span>
                </button>
              </li>
            )
          })}
          {data.jobs
            .filter(
              (job) =>
                job.stageGroup !== 'done' && isOverdue(job.dueDate, today),
            )
            .map((job) => (
              <JobLine
                key={job._id}
                job={job}
                today={today}
                onOpen={() => setView({ job })}
              />
            ))}
        </ul>
      ) : view.tab === 'jobs' ? (
        <ul className="flex flex-col">
          {data.jobs.map((job) => (
            <JobLine
              key={job._id}
              job={job}
              today={today}
              onOpen={() => setView({ job })}
            />
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col">
          {data.clients.map((client) => (
            <li key={client._id}>
              <button
                type="button"
                onClick={() => setView({ client })}
                className="flex w-full flex-col rounded-2xl px-4 py-3 text-left hover:bg-muted/60"
              >
                <span className="font-medium">
                  {client.isNoClient ? m.no_client() : client.name}
                </span>
                {client.phones[0] && (
                  <span className="text-sm text-muted-foreground">
                    {formatPhone(client.phones[0])}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t bg-background">
        <div className="mx-auto grid max-w-lg grid-cols-3 px-1 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {(
            [
              ['today', SunIcon, m.offline_today()],
              ['jobs', ClipboardTextIcon, data.words.job.plural],
              ['clients', UsersIcon, data.words.client.plural],
            ] as const
          ).map(([tab, Icon, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView({ tab })}
              className={cn(
                'flex min-h-12 flex-col items-center gap-1 text-xs',
                'tab' in view && view.tab === tab
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className="size-6" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
