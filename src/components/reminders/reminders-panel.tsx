import { BellIcon, PlusIcon } from '@phosphor-icons/react'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { Panel, PanelList } from '#/components/panel'
import { Button } from '#/components/ui/button'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * A client's, job's or item's open reminders, with a way to add one. A late
 * one is marked. Each opens its job, else its item, unless that is the page
 * it is on.
 */
export function RemindersPanel({
  reminders,
  on,
  today,
  onAdd,
}: {
  reminders: Array<{
    _id: Id<'reminders'>
    note: string
    date: string
    jobId?: Id<'jobs'>
    itemId?: Id<'items'>
  }>
  on: 'client' | 'job' | 'item'
  today: string
  onAdd: () => void
}) {
  return (
    <Panel
      title={m.reminder_list()}
      icon={BellIcon}
      action={
        <Button
          variant="ghost"
          className="h-11 text-primary lg:h-9"
          onClick={onAdd}
        >
          <PlusIcon data-icon="inline-start" />
          {m.reminder_add()}
        </Button>
      }
    >
      <PanelList>
        {reminders.map((reminder) => (
          <ReminderRow
            key={reminder._id}
            reminderId={reminder._id}
            note={reminder.note}
            detail={formatDay(reminder.date, today)}
            date={reminder.date}
            jobId={on === 'job' ? undefined : reminder.jobId}
            itemId={on === 'client' ? reminder.itemId : undefined}
          />
        ))}
      </PanelList>
    </Panel>
  )
}
