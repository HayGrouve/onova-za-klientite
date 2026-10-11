import { useId } from 'react'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { m } from '#/paraglide/messages.js'

/** The usual reasons, one tap each; anything else is typed. */
const QUICK = [
  m.cancel_reason_declined,
  m.cancel_reason_price,
  m.cancel_reason_no_answer,
  m.cancel_reason_twice,
]

/**
 * Why the job is cancelled, asked with the cancel question (D121). It can stay
 * empty. A usual reason is a tap that fills the box, and a tap again empties
 * it. The job page shows the reason under the stage, and the history keeps it.
 */
export function CancelReasonField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const reasons: string[] = QUICK.map((reason) => reason())
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>
        {m.job_cancel_reason()}
        <span className="font-normal text-muted-foreground">
          {m.optional_hint()}
        </span>
      </FieldLabel>
      <Input
        id={id}
        name="cancelReason"
        maxLength={500}
        enterKeyHint="done"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <ToggleGroup
        aria-label={m.cancel_reason_quick()}
        value={reasons.includes(value.trim()) ? [value.trim()] : []}
        onValueChange={(next: string[]) => onChange(next[0] ?? '')}
        className="w-full flex-wrap"
      >
        {reasons.map((reason) => (
          <ToggleGroupItem
            key={reason}
            value={reason}
            className="h-9 rounded-full bg-card px-3.5 text-foreground/80 ring-1 ring-border ring-inset hover:bg-muted aria-pressed:bg-accent aria-pressed:text-foreground aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:hover:bg-accent"
          >
            {reason}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}
