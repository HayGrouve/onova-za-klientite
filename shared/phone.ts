import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/** E.164 for a valid number, with Bulgaria as the default country. */
export function normalizePhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input.trim(), 'BG')
  return phone?.isValid() ? phone.number : null
}

export { formatPhone, telHref, viberHref } from './phone-format'
