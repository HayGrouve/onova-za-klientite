import { useState } from 'react'
import { BottomSheet } from '#/components/bottom-sheet'
import { useSheetGuard } from '#/hooks/use-discard-guard'

/**
 * Which form a job, client or item page has open in its sheet. A form
 * reports unsaved changes through `setDirty`; closing it from outside asks
 * first, and `close` (after a save) doesn't. `onClosed` runs whenever the
 * sheet closes.
 */
export function useDetailSheet<TPanel extends { kind: string }>(
  onClosed?: () => void,
) {
  const guard = useSheetGuard()
  const [panel, setPanel] = useState<TPanel | null>(null)
  const close = () => {
    guard.setDirty(false)
    setPanel(null)
    onClosed?.()
  }
  return {
    panel,
    open: (next: TPanel) => setPanel(next),
    close,
    setDirty: guard.setDirty,
    /** Closing from outside the form: asks first when it has unsaved changes. */
    dismiss: () => guard.close(close),
    prompt: guard.prompt,
  }
}

/** The page's sheet, titled for the form in it, with the discard question. */
export function DetailSheet({
  sheet,
  title,
  hideTitle,
  children,
}: {
  sheet: { panel: unknown; dismiss: () => void; prompt: React.ReactNode }
  title: React.ReactNode
  /** For a form that asks its own question, step by step. */
  hideTitle?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <BottomSheet
        open={sheet.panel !== null}
        onClose={sheet.dismiss}
        title={title}
        hideTitle={hideTitle}
      >
        <div className="px-4 pb-6">{children}</div>
      </BottomSheet>
      {sheet.prompt}
    </>
  )
}
