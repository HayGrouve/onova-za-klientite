import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatActivityMoment } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { asLogged, actorLabel } from '../../shared/activity'
import type { LoggedActivity } from '../../shared/activity'
import { formatDateTime } from '../../shared/dates'
import { formatMoney } from '../../shared/money'
import type { Words } from '../../shared/words'

type TimelineItem = FunctionReturnType<typeof api.jobs.get>['timeline'][number]

function describe(event: LoggedActivity, words: Words, today: string): string {
  const amountOf = (data: { amountCents?: number }) =>
    formatMoney(Math.abs(data.amountCents ?? 0))
  const fileName = (data: { name?: string }) => data.name || m.files_photo()
  switch (event.type) {
    case 'job.created':
      return m.event_job_created({ name: event.data.name ?? '' })
    case 'job.edited':
      return m.event_job_edited()
    case 'job.stageChanged':
      return m.event_job_stageChanged({ to: event.data.to ?? '' })
    case 'job.linesChanged':
      return m.event_job_linesChanged()
    case 'job.itemsChanged':
      return m.event_job_itemsChanged()
    case 'job.writtenOff':
      return m.event_job_writtenOff({ amount: amountOf(event.data) })
    case 'job.writeOffRemoved':
      return m.event_job_writeOffRemoved({ amount: amountOf(event.data) })
    case 'job.cancelled':
      return event.data.note
        ? `${m.event_job_cancelled()}: ${event.data.note}`
        : m.event_job_cancelled()
    case 'payment.added':
      return (event.data.amountCents ?? 0) < 0
        ? m.event_payment_refund({ amount: amountOf(event.data) })
        : m.event_payment_added({ amount: amountOf(event.data) }) +
            (event.data.note ? ` (${event.data.note})` : '')
    case 'payment.edited':
      return m.event_payment_edited({ amount: amountOf(event.data) })
    case 'payment.removed':
      return m.event_payment_removed({ amount: amountOf(event.data) })
    case 'credit.used':
      return m.event_credit_used({ amount: amountOf(event.data) })
    case 'cost.added':
      return m.event_cost_added({
        name: event.data.name ?? '',
        amount: amountOf(event.data),
      })
    case 'cost.edited':
      return m.event_cost_edited({ amount: amountOf(event.data) })
    case 'cost.removed':
      return m.event_cost_removed({ name: event.data.name ?? '' })
    case 'client.created':
      return m.event_client_created({ name: event.data.name ?? '' })
    case 'client.edited':
      return m.event_client_edited()
    case 'item.created':
      return m.event_item_created({ name: event.data.name ?? '' })
    case 'item.edited':
      return m.event_item_edited()
    case 'item.moved':
      return m.event_item_moved()
    case 'appointment.added':
      return m.event_appointment_added({
        appointment: words.appointment.singular,
        date: formatActivityMoment(event.data.to ?? '', today),
      })
    case 'appointment.changed':
      return m.event_appointment_changed({
        date: formatActivityMoment(event.data.to ?? '', today),
      })
    case 'appointment.cancelled':
      return m.event_appointment_cancelled()
    case 'reminder.added':
      return m.event_reminder_added({ note: event.data.note ?? '' })
    case 'reminder.closed':
      return m.event_reminder_closed({ note: event.data.note ?? '' })
    case 'reminder.moved':
      return m.event_reminder_moved({ note: event.data.note ?? '' })
    case 'reminder.reopened':
      return m.event_reminder_reopened({ note: event.data.note ?? '' })
    case 'job.repeatSet':
      return m.event_job_repeatSet()
    case 'job.repeatStopped':
      return m.event_job_repeatStopped()
    case 'job.repeated':
      return m.event_job_repeated({
        date: formatActivityMoment(event.data.to ?? '', today),
      })
    case 'file.added':
      return m.event_file_added({ name: fileName(event.data) })
    case 'file.removed':
      return m.event_file_removed({ name: fileName(event.data) })
    case 'client.merged':
      return m.event_client_merged({ name: event.data.from ?? '' })
    case 'client.anonymized':
      return m.event_client_anonymized()
    // Settings changes belong to no job, client or item, so no timeline
    // shows them; they are named here so a new type can't slip through.
    case 'stage.added':
    case 'stage.edited':
    case 'stage.removed':
    case 'stages.reordered':
    case 'field.added':
    case 'field.edited':
    case 'field.archived':
    case 'field.restored':
    case 'setup.applied':
    case 'settings.changed':
      return m.event_other()
  }
}

/** A record's history from the activity log, newest first. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  const { business } = useViewer()
  const today = useToday()
  return (
    <ol className="mr-4 ml-6 flex stagger flex-col gap-3 border-l-2 border-border/80 pl-4">
      {items.map((item) => (
        <li
          key={item._id}
          // The dot sits on the line: 16px padding, half the 2px line, half the 10px dot.
          className="relative flex flex-col gap-0.5 before:absolute before:top-1.5 before:-left-[22px] before:size-2.5 before:rounded-full before:bg-primary/70 before:ring-3 before:ring-card first:before:bg-primary"
        >
          <span className="text-sm break-words">
            {describe(asLogged(item), business.words, today)}
          </span>
          <span className="text-xs break-words text-muted-foreground">
            {formatDateTime(item._creationTime)}
            {item.actorName && ` · ${actorLabel(item.actorName)}`}
          </span>
        </li>
      ))}
    </ol>
  )
}
