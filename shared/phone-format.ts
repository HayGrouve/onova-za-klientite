// Display and links for stored E.164 numbers. The small `min` metadata is
// enough to format a number that was validated when it was saved; checking
// new input needs the full metadata in shared/phone.ts.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164
}

export function telHref(e164: string): string {
  return `tel:${e164}`
}

export function viberHref(e164: string): string {
  return `viber://chat?number=${encodeURIComponent(e164)}`
}
