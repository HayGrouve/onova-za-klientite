import { useMutation } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { activeValues } from '#/components/client-form'
import { ExtraFieldsEditor } from '#/components/extra-fields'
import type { ExtraValues } from '#/components/extra-fields'
import { FormFooter } from '#/components/form-footer'
import { AddFieldLink } from '#/components/settings/add-field-link'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import { runChange } from '#/lib/change'
import { m } from '#/paraglide/messages.js'
import { moneyInputText, parseMoney } from '../../../shared/money'

/** Title, due date, address, notes, typed price and extra fields of a job. */
export function JobEditForm({
  businessId,
  job,
  fields,
  onDone,
  onDirtyChange,
}: {
  businessId: Id<'businesses'>
  job: Doc<'jobs'>
  fields: Array<Doc<'fields'>>
  onDone: () => void
  /** Told whenever the form differs from what it opened with. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const update = useMutation(api.jobs.update)
  const [title, setTitle] = useState(job.title)
  const [dueDate, setDueDate] = useState(job.dueDate ?? '')
  const [address, setAddress] = useState(job.address ?? '')
  const [notes, setNotes] = useState(job.notes ?? '')
  const [price, setPrice] = useState(moneyInputText(job.typedPriceCents))
  const [extra, setExtra] = useState<ExtraValues>(job.extra)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const priceInput = useRef<HTMLInputElement>(null)
  const hasLines = job.lines.length > 0
  const titleMissing = !title.trim()
  // A typed price that is not an amount is an error, not a cleared price.
  const priceInvalid =
    !hasLines && price.trim() !== '' && parseMoney(price) === null
  const dirty =
    title !== job.title ||
    dueDate !== (job.dueDate ?? '') ||
    address !== (job.address ?? '') ||
    notes !== (job.notes ?? '') ||
    price !== moneyInputText(job.typedPriceCents) ||
    JSON.stringify(extra) !== JSON.stringify(job.extra)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  // A form that goes away has nothing left unsaved.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (titleMissing || priceInvalid) {
      setTried(true)
      ;(titleMissing ? titleInput : priceInput).current?.focus()
      return
    }
    // An extra number or money field with text that isn't one shows its own
    // error (setCustomValidity); the form skips the browser's check, so look.
    const invalid = event.currentTarget.querySelector<HTMLElement>(':invalid')
    if (invalid) {
      invalid.focus()
      return
    }
    setSaving(true)
    const saved = await runChange(async () => {
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
    })
    if (!saved.done) setSaving(false)
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="job-title">{m.job_title()}</FieldLabel>
          <Input
            ref={titleInput}
            id="job-title"
            name="title"
            maxLength={200}
            value={title}
            aria-invalid={tried && titleMissing}
            aria-describedby={
              tried && titleMissing ? 'job-title-error' : undefined
            }
            onChange={(event) => setTitle(event.target.value)}
          />
          {tried && titleMissing && (
            <FieldError id="job-title-error">
              {m.job_title_required()}
            </FieldError>
          )}
        </Field>
        {!hasLines && (
          <Field>
            <FieldLabel htmlFor="job-price">{m.job_price()}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                ref={priceInput}
                id="job-price"
                name="price"
                inputMode="decimal"
                value={price}
                aria-invalid={tried && priceInvalid}
                aria-describedby={
                  tried && priceInvalid ? 'job-price-error' : undefined
                }
                onChange={(event) => setPrice(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            {tried && priceInvalid && (
              <FieldError id="job-price-error">
                {m.field_money_invalid()}
              </FieldError>
            )}
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="job-due">{m.job_due()}</FieldLabel>
          <Input
            id="job-due"
            name="due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="job-address">{m.job_address()}</FieldLabel>
          <Input
            id="job-address"
            name="address"
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
            name="notes"
            rows={4}
            className="rounded-xl"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <FormFooter>
        <Button type="submit" size="xl" className="flex-1" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {m.job_save()}
        </Button>
      </FormFooter>
    </form>
  )
}
