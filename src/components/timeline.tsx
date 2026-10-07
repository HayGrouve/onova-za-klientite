import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatActivityMoment } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../shared/money'
import type { Words } from '../../shared/words'

type TimelineItem = FunctionReturnType<typeof api.jobs.get>['timeline'][number]

const WHEN = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'numeric',
  year: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Sofia',
})

function describe(item: TimelineItem, words: Words, today: string) {
  const { data } = item
  const when = formatActivityMoment(data.to ?? '', today)
  const amount = formatMoney(Math.abs(data.amountCents ?? 0))
  const name = data.name ?? ''
  switch (item.type) {
    case 'job.created':
      return m.event_job_created({ name })
    case 'job.edited':
      return m.event_job_edited()
    case 'job.stageChanged':
      return m.event_job_stageChanged({ to: data.to ?? '' })
    case 'job.linesChanged':
      return m.event_job_linesChanged()
    case 'job.itemsChanged':
      return m.event_job_itemsChanged()
    case 'job.writtenOff':
      return m.event_job_writtenOff({ amount })
    case 'job.writeOffRemoved':
      return m.event_job_writeOffRemoved({ amount })
    case 'job.cancelled':
      return data.note
        ? `${m.event_job_cancelled()}: ${data.note}`
        : m.event_job_cancelled()
    case 'payment.added':
      return (data.amountCents ?? 0) < 0
        ? m.event_payment_refund({ amount })
        : m.event_payment_added({ amount }) +
            (data.note ? ` (${data.note})` : '')
    case 'payment.edited':
      return m.event_payment_edited({ amount })
    case 'payment.removed':
      return m.event_payment_removed({ amount })
    case 'credit.used':
      return m.event_credit_used({ amount })
    case 'cost.added':
      return m.event_cost_added({ name, amount })
    case 'cost.edited':
      return m.event_cost_edited({ amount })
    case 'cost.removed':
      return m.event_cost_removed({ name })
    case 'client.created':
      return m.event_client_created({ name })
    case 'client.edited':
      return m.event_client_edited()
    case 'item.created':
      return m.event_item_created({ name })
    case 'item.edited':
      return m.event_item_edited()
    case 'item.moved':
      return m.event_item_moved()
    case 'appointment.added':
      return m.event_appointment_added({
        appointment: words.appointment.singular,
        date: when,
      })
    case 'appointment.changed':
      return m.event_appointment_changed({ date: when })
    case 'appointment.cancelled':
      return m.event_appointment_cancelled()
    case 'reminder.added':
      return m.event_reminder_added({ note: data.note ?? '' })
    case 'reminder.closed':
      return m.event_reminder_closed({ note: data.note ?? '' })
    case 'reminder.moved':
      return m.event_reminder_moved({ note: data.note ?? '' })
    case 'reminder.reopened':
      return m.event_reminder_reopened({ note: data.note ?? '' })
    case 'job.repeatSet':
      return m.event_job_repeatSet()
    case 'job.repeatStopped':
      return m.event_job_repeatStopped()
    case 'job.repeated':
      return m.event_job_repeated({ date: when })
    case 'file.added':
      return m.event_file_added({ name: name || m.files_photo() })
    case 'file.removed':
      return m.event_file_removed({ name: name || m.files_photo() })
    default:
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
          <span className="text-sm">
            {describe(item, business.words, today)}
          </span>
          <span className="text-xs text-muted-foreground">
            {WHEN.format(item._creationTime)}
            {item.actorName && ` · ${item.actorName}`}
          </span>
        </li>
      ))}
    </ol>
  )
}
