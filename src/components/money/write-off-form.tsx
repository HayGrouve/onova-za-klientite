import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useSubmit } from '#/components/money/use-submit'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'

/** Closes the unpaid rest of a job for good, with a note (D7). */
export function WriteOffForm({
  businessId,
  jobId,
  balanceCents,
  onDone,
}: {
  businessId: Id<'businesses'>
  jobId: Id<'jobs'>
  balanceCents: number
  onDone: () => void
}) {
  const writeOff = useMutation(api.jobs.writeOff)
  const { busy, run } = useSubmit(onDone)
  const [note, setNote] = useState('')
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() => writeOff({ businessId, jobId, note }))
      }}
    >
      <p className="text-sm">
        {m.writeoff_body({ amount: formatMoney(balanceCents) })}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="writeoff-note">{m.writeoff_note()}</FieldLabel>
          <Input
            id="writeoff-note"
            required
            autoFocus
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        size="xl"
        variant="destructive"
        disabled={busy || !note.trim()}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {m.writeoff_save()}
      </Button>
    </form>
  )
}
