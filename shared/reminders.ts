// Reminder dates (Q5): the quick picks next to the date field, and the short
// delays a reminder can be snoozed by. All Sofia calendar dates (D1, D2).

import { addDays, addMonths } from './dates'

/** The quick picks on a new reminder, soonest first. */
export const REMINDER_PICKS = [
  'tomorrow',
  'week',
  'month',
  '2months',
  '3months',
  '6months',
  'year',
] as const

export type ReminderPick = (typeof REMINDER_PICKS)[number]

/** "Snooze" offers the short ones: a reminder put off for a year would be forgotten. */
export const SNOOZE_PICKS = [
  'tomorrow',
  'week',
  'month',
] as const satisfies readonly ReminderPick[]

/** The date a pick gives, counted from today. Months clamp like the reminder rule's. */
export function pickReminderDate(today: string, pick: ReminderPick) {
  switch (pick) {
    case 'tomorrow':
      return addDays(today, 1)
    case 'week':
      return addDays(today, 7)
    case 'month':
      return addMonths(today, 1)
    case '2months':
      return addMonths(today, 2)
    case '3months':
      return addMonths(today, 3)
    case '6months':
      return addMonths(today, 6)
    case 'year':
      return addMonths(today, 12)
  }
}

/** The pick that gives exactly this date, if any. */
export function matchingPick(today: string, date: string) {
  return REMINDER_PICKS.find((pick) => pickReminderDate(today, pick) === date)
}
