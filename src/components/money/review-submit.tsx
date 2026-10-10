import { useEffect, useId, useRef, useState } from 'react'
import { cn } from 'cn'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'

/** How long the confirm button stays disabled after the review appears. */
const ARM_MS = 500

/**
 * Whether a form is being reviewed before it commits. `snapshot` is a string
 * of everything the person can edit, so any edit ends the review without
 * each field having to say so.
 */
export function useReview(snapshot: string) {
  const [reviewed, setReviewed] = useState<string | null>(null)
  return {
    reviewing: reviewed === snapshot,
    start: () => setReviewed(snapshot),
    back: () => setReviewed(null),
  }
}

/**
 * The submit button of a form that records money. Before the review it reads
 * as a step ("Review"); the form's submit handler calls `review.start()` once
 * it is valid. Then the same button, in the same place, becomes the commit
 * with what it records ("Record 100 €"), and the box above it opens to show
 * the details, so the page changes as little as it can.
 */
export function ReviewSubmit({
  review,
  label,
  confirmLabel,
  summary,
  busy,
  onConfirm,
  tone = 'default',
  disabled = false,
  aside,
  showBack = true,
}: {
  review: ReturnType<typeof useReview>
  /** The first step's button: it reviews, it doesn't record. */
  label: React.ReactNode
  /** The commit, with the amount: "Record 100 €". */
  confirmLabel: React.ReactNode
  /** What will be recorded, as the lines of the highlighted box. */
  summary: React.ReactNode
  busy: boolean
  onConfirm: () => void
  /** Red for money that leaves, like a refund. */
  tone?: 'default' | 'destructive'
  disabled?: boolean
  /** Next to the first button before the review, like a Cancel. "Back" takes its place after. */
  aside?: React.ReactNode
  /**
   * The "Back" beside the confirm. A stepped sheet has its own back control
   * and moves focus to the step's heading instead (D117).
   */
  showBack?: boolean
}) {
  const summaryId = useId()
  const back = useRef<HTMLButtonElement>(null)
  const [armed, setArmed] = useState(false)
  const { reviewing } = review
  // Focus lands on "Back", so a second Enter can't record twice. The confirm
  // sits where the first button was, so a double tap would land on it: it is
  // enabled only after a short moment.
  useEffect(() => {
    if (!reviewing) return
    back.current?.focus()
    const timer = window.setTimeout(() => setArmed(true), ARM_MS)
    // Disarmed on the way out, so the next review starts disabled too.
    return () => {
      window.clearTimeout(timer)
      setArmed(false)
    }
  }, [reviewing])

  return (
    <div
      role={reviewing ? 'group' : undefined}
      aria-labelledby={reviewing ? summaryId : undefined}
      className="flex flex-col"
    >
      {/* Opens in place, so the sheet grows smoothly instead of jumping. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none',
          reviewing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!reviewing}>
          <div
            id={summaryId}
            className="mb-3 flex flex-col gap-1 rounded-xl bg-muted/60 p-3 text-sm"
          >
            {summary}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type={reviewing ? 'button' : 'submit'}
          size="xl"
          variant={tone}
          className="flex-1"
          disabled={reviewing ? busy || !armed : disabled || busy}
          onClick={reviewing ? onConfirm : undefined}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {reviewing ? confirmLabel : label}
        </Button>
        {!reviewing && aside}
        {reviewing && showBack && (
          <Button
            ref={back}
            type="button"
            size="xl"
            variant="outline"
            disabled={busy}
            onClick={review.back}
          >
            {m.back()}
          </Button>
        )}
      </div>
    </div>
  )
}

/** The amount in a review sentence: bold, with digits that line up. */
export function ReviewAmount({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold tabular-nums">{children}</strong>
}
