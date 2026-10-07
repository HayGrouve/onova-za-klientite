import { monthsLabel } from '#/components/setup/steps'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { m } from '#/paraglide/messages.js'
import {
  REMINDER_PICKS,
  matchingPick,
  pickReminderDate,
} from '../../../shared/reminders'
import type { ReminderPick } from '../../../shared/reminders'

/** The words for each quick pick: the month ones are the reminder rule's own. */
export const PICK_LABEL: Record<ReminderPick, () => string> = {
  tomorrow: m.reminder_pick_tomorrow,
  week: m.reminder_pick_week,
  month: () => monthsLabel(1),
  '2months': () => monthsLabel(2),
  '3months': () => monthsLabel(3),
  '6months': () => monthsLabel(6),
  year: () => monthsLabel(12),
}

/**
 * Quick dates next to a date field: tomorrow, a week, a month and so on, from
 * today. The chip for the current date shows as chosen; any other date is
 * typed in the field.
 */
export function DatePicks({
  today,
  value,
  onPick,
}: {
  today: string
  value: string
  onPick: (date: string) => void
}) {
  const chosen = matchingPick(today, value)
  return (
    <ToggleGroup
      aria-label={m.reminder_picks()}
      value={chosen ? [chosen] : []}
      onValueChange={(next: string[]) => {
        const pick = REMINDER_PICKS.find((item) => item === next[0])
        if (pick) onPick(pickReminderDate(today, pick))
      }}
      variant="outline"
      size="xl"
      className="w-full flex-wrap"
    >
      {REMINDER_PICKS.map((pick) => (
        <ToggleGroupItem
          key={pick}
          value={pick}
          className="text-sm aria-pressed:border-primary aria-pressed:bg-primary/8"
        >
          {PICK_LABEL[pick]()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
