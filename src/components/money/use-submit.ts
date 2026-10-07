import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

/** Runs a save, shows the outcome, and keeps the button busy meanwhile. */
export function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>, success = m.saved()) => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(false)
    }
  }
  return { busy, run }
}
