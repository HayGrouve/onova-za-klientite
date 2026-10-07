// Display and links for stored E.164 numbers. The small `min` metadata is
// enough to format a number that was validated when it was saved; checking
// new input needs the full metadata in shared/phone.ts.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

/**
 * A Bulgarian number the way people write it here ("088 812 3456"), any other
 * with its country code. Stored and linked as E.164 either way (D9).
 */
export function formatPhone(e164: string): string {
  const phone = parsePhoneNumberFromString(e164)
  if (!phone) return e164
  return phone.country === 'BG'
    ? phone.formatNational()
    : phone.formatInternational()
}

export function telHref(e164: string): string {
  return `tel:${e164}`
}

export function viberHref(e164: string): string {
  return `viber://chat?number=${encodeURIComponent(e164)}`
}
