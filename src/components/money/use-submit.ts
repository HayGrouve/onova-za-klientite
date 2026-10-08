import { useState } from 'react'
import { toast } from 'sonner'
import { runChange } from '#/lib/change'
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
    setBusy(true)
    const result = await runChange(action)
    if (!result.done) return setBusy(false)
    toast.success(success)
    if (onDone) onDone()
    else setBusy(false)
  }
  return { busy, run }
}
