import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

/**
 * Runs a save, shows the outcome, and keeps the button busy meanwhile. With
 * `onDone` (a sheet closing, a page changing) the button stays busy, so a
 * second tap can't save twice on the way out. Without it the form stays on
 * screen and takes the next save.
 */
export function useSubmit(onDone?: () => void) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>, success = m.saved()) => {
    // View offline, edit online (ADR 0010): don't queue changes without a connection.
    if (!navigator.onLine) {
      toast.error(m.offline_edit_blocked())
      return
    }
    setBusy(true)
    try {
      await action()
      toast.success(success)
      if (onDone) onDone()
      else setBusy(false)
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(false)
    }
  }
  return { busy, run }
}
