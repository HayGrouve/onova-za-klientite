// The Contact Picker API: Android Chrome only, feature-detected.
type ContactsManager = {
  select: (
    properties: Array<'name' | 'tel'>,
    options?: { multiple?: boolean },
  ) => Promise<
    Array<{ name?: Array<string | undefined>; tel?: Array<string | undefined> }>
  >
}

function manager(): ContactsManager | null {
  if (typeof navigator === 'undefined') return null
  const contacts = (navigator as Navigator & { contacts?: ContactsManager })
    .contacts
  return contacts && 'ContactsManager' in window ? contacts : null
}

export function canPickContact() {
  return manager() !== null
}

/** One contact from the phone's address book, or null if cancelled. */
export async function pickContact(): Promise<{
  name: string
  phone?: string
} | null> {
  const contacts = manager()
  if (!contacts) return null
  const [picked] = (await contacts.select(['name', 'tel'], {
    multiple: false,
  })) as Array<
    | { name?: Array<string | undefined>; tel?: Array<string | undefined> }
    | undefined
  >
  const name = picked?.name?.[0]?.trim()
  const phone = picked?.tel?.[0]?.trim()
  if (!name && !phone) return null
  return { name: name || phone || '', phone: phone || undefined }
}
