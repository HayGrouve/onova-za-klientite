import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'

/**
 * A destructive button that asks before it acts: the first tap swaps it for
 * the question, the action and "Cancel", in place, as removing a payment does.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel = label,
  busy = false,
  onConfirm,
  variant = 'destructive',
  className,
}: {
  label: React.ReactNode
  question: React.ReactNode
  confirmLabel?: React.ReactNode
  busy?: boolean
  onConfirm: () => void
  /** How the first, asking button looks. The confirm button is always red. */
  variant?: 'destructive' | 'outline' | 'ghost'
  className?: string
}) {
  const [asking, setAsking] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  // Focus lands on "Cancel", so a double tap or a second Enter is safe.
  useEffect(() => {
    if (asking) cancel.current?.focus()
  }, [asking])

  if (!asking) {
    return (
      <Button
        type="button"
        size="xl"
        variant={variant}
        className={className}
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        {label}
      </Button>
    )
  }
  return (
    <div role="group" className="flex flex-col gap-3">
      <p className="text-sm text-pretty">{question}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="xl"
          variant="destructive"
          className="flex-1"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {confirmLabel}
        </Button>
        <Button
          ref={cancel}
          type="button"
          size="xl"
          variant="outline"
          onClick={() => setAsking(false)}
        >
          {m.cancel()}
        </Button>
      </div>
    </div>
  )
}
