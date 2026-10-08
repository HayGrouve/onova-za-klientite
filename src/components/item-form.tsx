import { useMutation } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { activeValues, snapshot } from '#/components/client-form'
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
import { Spinner } from '#/components/ui/spinner'
import { useWide } from '#/hooks/use-wide'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

export function ItemForm({
  businessId,
  clientId,
  jobId,
  item,
  fields,
  onSaved,
  onDirtyChange,
}: {
  businessId: Id<'businesses'>
  clientId: Id<'clients'>
  /** A new item is linked to this job as it is saved. */
  jobId?: Id<'jobs'>
  item?: Doc<'items'>
  fields: Array<Doc<'fields'>>
  onSaved: (itemId: Id<'items'>) => void
  /** Tells the page or sheet whether there are unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const create = useMutation(api.items.create)
  const update = useMutation(api.items.update)
  const [name, setName] = useState(item?.name ?? '')
  const [extra, setExtra] = useState<ExtraValues>(item?.extra ?? {})
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const wide = useWide()
  const current = snapshot({ name, extra })
  const [initial] = useState(current)
  const dirty = current !== initial
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  // A form that goes away has nothing left unsaved.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setTried(true)
      nameInput.current?.focus()
      return
    }
    setSaving(true)
    try {
      const values = { name, extra: activeValues(fields, extra) }
      if (item) {
        await update({ businessId, itemId: item._id, ...values })
        onSaved(item._id)
      } else {
        onSaved(await create({ businessId, clientId, jobId, ...values }))
      }
      toast.success(m.saved())
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
          <FieldLabel htmlFor="item-name">{m.item_name()}</FieldLabel>
          <Input
            ref={nameInput}
            id="item-name"
            name="name"
            autoFocus={!item && wide}
            maxLength={120}
            aria-invalid={tried && !name.trim()}
            aria-describedby={
              tried && !name.trim() ? 'item-name-error' : undefined
            }
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {tried && !name.trim() && (
            <FieldError id="item-name-error">{m.name_required()}</FieldError>
          )}
        </Field>
        <ExtraFieldsEditor fields={fields} values={extra} onChange={setExtra} />
        <AddFieldLink target="item" />
      </FieldGroup>
      <FormFooter>
        <Button type="submit" size="xl" className="flex-1" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
      </FormFooter>
    </form>
  )
}
