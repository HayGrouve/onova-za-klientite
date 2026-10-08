import { useEffect, useId, useRef, useState } from 'react'
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
 * The submit button of a form that records money. Before the review it is the
 * plain button; the form's submit handler calls `review.start()` once it is
 * valid. Then it shows what will be recorded and asks once more, in place.
 */
export function ReviewSubmit({
  review,
  label,
  summary,
  busy,
  onConfirm,
  tone = 'default',
  disabled = false,
}: {
  review: ReturnType<typeof useReview>
  label: React.ReactNode
  /** What will be recorded, as the lines of the highlighted box. */
  summary: React.ReactNode
  busy: boolean
  onConfirm: () => void
  /** Red for money that leaves, like a refund. */
  tone?: 'default' | 'destructive'
  disabled?: boolean
}) {
  const summaryId = useId()
  const back = useRef<HTMLButtonElement>(null)
  const [armed, setArmed] = useState(false)
  // Focus lands on "Back", so a second Enter can't record twice. A bottom
  // sheet keeps its last button where the submit button was, so a double tap
  // would land on the confirm: it is enabled only after a short moment.
  useEffect(() => {
    if (!review.reviewing) return
    back.current?.focus()
    setArmed(false)
    const timer = window.setTimeout(() => setArmed(true), ARM_MS)
    return () => window.clearTimeout(timer)
  }, [review.reviewing])

  if (!review.reviewing) {
    return (
      <Button
        type="submit"
        size="xl"
        variant={tone}
        disabled={disabled || busy}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {label}
      </Button>
    )
  }
  return (
    <div
      role="group"
      aria-labelledby={summaryId}
      className="flex flex-col gap-3"
    >
      <div
        id={summaryId}
        className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3 text-sm"
      >
        {summary}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="xl"
          variant={tone}
          className="flex-1"
          disabled={busy || !armed}
          onClick={onConfirm}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {label}
        </Button>
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
      </div>
    </div>
  )
}

/** The amount in a review sentence: bold, with digits that line up. */
export function ReviewAmount({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold tabular-nums">{children}</strong>
}
