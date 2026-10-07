import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/** E.164 for a valid number, with Bulgaria as the default country. */
export function normalizePhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input.trim(), 'BG')
  return phone?.isValid() ? phone.number : null
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164
}

export function telHref(e164: string): string {
  return `tel:${e164}`
}

export function viberHref(e164: string): string {
  return `viber://chat?number=${encodeURIComponent(e164)}`
}
