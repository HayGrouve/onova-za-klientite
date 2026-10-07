import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { activeValues } from '#/components/client-form'
import { ExtraFieldsEditor } from '#/components/extra-fields'
import type { ExtraValues } from '#/components/extra-fields'
import { FormFooter } from '#/components/form-footer'
import { AddFieldLink } from '#/components/settings/add-field-link'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { formatMoney, parseMoney } from '../../../shared/money'

function moneyText(cents: number | undefined) {
  return cents === undefined ? '' : formatMoney(cents).replace(/\s?€/, '')
}

/** Title, due date, address, notes, typed price and extra fields of a job. */
export function JobEditForm({
  businessId,
  job,
  fields,
  onDone,
}: {
  businessId: Id<'businesses'>
  job: Doc<'jobs'>
  fields: Array<Doc<'fields'>>
  onDone: () => void
}) {
  const update = useMutation(api.jobs.update)
  const [title, setTitle] = useState(job.title)
  const [dueDate, setDueDate] = useState(job.dueDate ?? '')
  const [address, setAddress] = useState(job.address ?? '')
  const [notes, setNotes] = useState(job.notes ?? '')
  const [price, setPrice] = useState(moneyText(job.typedPriceCents))
  const [extra, setExtra] = useState<ExtraValues>(job.extra)
  const [saving, setSaving] = useState(false)
  const hasLines = job.lines.length > 0

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await update({
        businessId,
        jobId: job._id,
        title,
        dueDate: dueDate || null,
        address: address || null,
        notes: notes || null,
        ...(hasLines
          ? {}
          : { typedPriceCents: price.trim() ? parseMoney(price) : null }),
        extra: activeValues(fields, extra),
      })
      toast.success(m.saved())
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="job-title">{m.job_title()}</FieldLabel>
          <Input
            id="job-title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        {!hasLines && (
          <Field>
            <FieldLabel htmlFor="job-price">{m.job_price()}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="job-price"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="job-due">{m.job_due()}</FieldLabel>
          <Input
            id="job-due"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="job-address">{m.job_address()}</FieldLabel>
          <Input
            id="job-address"
            maxLength={500}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <ExtraFieldsEditor fields={fields} values={extra} onChange={setExtra} />
        <AddFieldLink target="job" />
        <Field>
          <FieldLabel htmlFor="job-notes">{m.job_notes()}</FieldLabel>
          <Textarea
            id="job-notes"
            rows={4}
            className="rounded-xl"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <FormFooter>
        <Button
          type="submit"
          size="xl"
          className="flex-1"
          disabled={saving || !title.trim()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {m.job_save()}
        </Button>
      </FormFooter>
    </form>
  )
}
