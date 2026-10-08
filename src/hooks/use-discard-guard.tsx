import { useBlocker } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { DiscardSheet } from '#/components/discard-sheet'

/**
 * Guards a sheet that holds a form. The form reports whether it has unsaved
 * changes through `setDirty`; the sheet closes through `close`, which asks
 * first when there are some. Render `prompt` next to the sheet.
 *
 *   <Sheet open={open} onOpenChange={(next) => next ? setOpen(true) : guard.close(() => setOpen(false))}>
 *     <Form onDirtyChange={guard.setDirty} onDone={() => setOpen(false)} />
 *   </Sheet>
 *   {guard.prompt}
 */
export function useSheetGuard() {
  const dirty = useRef(false)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const setDirty = useCallback((next: boolean) => {
    dirty.current = next
  }, [])
  const close = useCallback((done: () => void) => {
    if (dirty.current) setPending(() => done)
    else done()
  }, [])
  const prompt = (
    <DiscardSheet
      open={pending !== null}
      onKeep={() => setPending(null)}
      onDiscard={() => {
        dirty.current = false
        pending?.()
        setPending(null)
      }}
    />
  )
  return { setDirty, close, prompt }
}

/**
 * Guards a page that holds a form: leaving it, or closing the tab, with
 * unsaved changes asks first. Call `release` just before navigating away
 * after a save. Render `prompt` on the page.
 */
export function usePageGuard(dirty: boolean) {
  const released = useRef(false)
  const blocker = useBlocker({
    shouldBlockFn: useCallback(() => dirty && !released.current, [dirty]),
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const release = useCallback(() => {
    released.current = true
  }, [])
  const prompt = (
    <DiscardSheet
      open={blocker.status === 'blocked'}
      onKeep={() => blocker.reset?.()}
      onDiscard={() => blocker.proceed?.()}
    />
  )
  return { release, prompt }
}
