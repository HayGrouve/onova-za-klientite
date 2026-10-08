import { isValidDate } from '../../shared/dates'
import { isCents } from '../../shared/money'
import { fail } from './errors'

/** Trimmed text that must not be empty and fits `max`. */
export function requiredText(value: string, field: string, max = 200): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) fail('invalid', { field })
  return trimmed
}

/** Trimmed optional text; empty becomes undefined. */
export function optionalText(
  value: string | undefined,
  field: string,
  max = 2000,
): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.length > max) fail('invalid', { field })
  return trimmed || undefined
}

/** Integer euro cents (ADR 0007). */
export function cents(
  value: number,
  field: string,
  { allowNegative = false } = {},
) {
  if (!isCents(value) || (!allowNegative && value < 0))
    fail('invalid', { field })
  return value
}

export function calendarDate(value: string, field: string): string {
  if (!isValidDate(value)) fail('invalid', { field })
  return value
}

export function optionalDate(value: string | undefined, field: string) {
  return value === undefined ? undefined : calendarDate(value, field)
}

/** A clock time in Sofia: whole hours 0–23 and minutes 0–59. */
export function clockTime<T extends { hour: number; minute: number }>(
  time: T | undefined,
  field: string,
): T | undefined {
  if (
    time &&
    !(
      Number.isInteger(time.hour) &&
      time.hour >= 0 &&
      time.hour <= 23 &&
      Number.isInteger(time.minute) &&
      time.minute >= 0 &&
      time.minute <= 59
    )
  ) {
    fail('invalid', { field })
  }
  return time
}
