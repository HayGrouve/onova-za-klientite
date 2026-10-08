import { BellIcon, PlusIcon } from '@phosphor-icons/react'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { Panel, PanelList } from '#/components/panel'
import { Button } from '#/components/ui/button'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import type { Id } from '../../../convex/_generated/dataModel'

/** A job's or an item's open reminders, with a way to add one. */
export function RemindersPanel({
  reminders,
  today,
  onAdd,
}: {
  reminders: Array<{ _id: Id<'reminders'>; note: string; date: string }>
  today: string
  onAdd: () => void
}) {
  return (
    <Panel
      title={m.reminder_list()}
      icon={BellIcon}
      action={
        <Button variant="ghost" className="h-9 text-primary" onClick={onAdd}>
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
          />
        ))}
      </PanelList>
    </Panel>
  )
}
