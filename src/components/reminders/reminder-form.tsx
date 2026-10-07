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

/** A reminder for a client, job or item. The rule (Q5) only fills this in; saving is the person's call. */
export function ReminderForm({
  businessId,
  target,
  initialDate,
  initialNote = '',
  source = 'manual',
  onDone,
  onSkip,
}: {
  businessId: Id<'businesses'>
  target: { clientId?: Id<'clients'>; jobId?: Id<'jobs'>; itemId?: Id<'items'> }
  initialDate: string
  initialNote?: string
  source?: 'manual' | 'rule'
  onDone: () => void
  onSkip?: () => void
}) {
  const add = useMutation(api.reminders.add)
  const { busy, run } = useSubmit(onDone)
  const [date, setDate] = useState(initialDate)
  const [note, setNote] = useState(initialNote)
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() => add({ businessId, ...target, date, note, source }))
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="reminder-date">{m.reminder_date()}</FieldLabel>
          <Input
            id="reminder-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="reminder-note">{m.reminder_note()}</FieldLabel>
          <Input
            id="reminder-note"
            required
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="xl"
          className="flex-1"
          disabled={busy || !note.trim() || !date}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {source === 'rule' ? m.reminder_rule_add() : m.reminder_save()}
        </Button>
        {onSkip && (
          <Button type="button" variant="outline" size="xl" onClick={onSkip}>
            {m.reminder_rule_skip()}
          </Button>
        )}
      </div>
    </form>
  )
}
