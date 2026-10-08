import { toast } from 'sonner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

export type ChangeResult<T> = { done: true; value: T } | { done: false }

/**
 * Runs one change to the data: a mutation, or a few in a row. View offline,
 * edit online (ADR 0010): without a connection nothing runs and the person is
 * told so. A failure shows its message. Every change the app makes goes
 * through here, so these two rules hold everywhere.
 */
export async function runChange<T>(
  action: () => Promise<T>,
): Promise<ChangeResult<T>> {
  if (!navigator.onLine) {
    toast.error(m.offline_edit_blocked())
    return { done: false }
  }
  try {
    return { done: true, value: await action() }
  } catch (error) {
    toast.error(errorMessage(error))
    return { done: false }
  }
}
