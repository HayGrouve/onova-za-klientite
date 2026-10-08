import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { activeValues } from '#/components/client-form'
import { ExtraFieldsEditor } from '#/components/extra-fields'
import type { ExtraValues } from '#/components/extra-fields'
import { FormFooter } from '#/components/form-footer'
import { AddFieldLink } from '#/components/settings/add-field-link'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

export function ItemForm({
  businessId,
  clientId,
  jobId,
  item,
  fields,
  onSaved,
}: {
  businessId: Id<'businesses'>
  clientId: Id<'clients'>
  /** A new item is linked to this job as it is saved. */
  jobId?: Id<'jobs'>
  item?: Doc<'items'>
  fields: Array<Doc<'fields'>>
  onSaved: (itemId: Id<'items'>) => void
}) {
  const create = useMutation(api.items.create)
  const update = useMutation(api.items.update)
  const [name, setName] = useState(item?.name ?? '')
  const [extra, setExtra] = useState<ExtraValues>(item?.extra ?? {})
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
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
            id="item-name"
            required
            autoFocus={!item}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ExtraFieldsEditor fields={fields} values={extra} onChange={setExtra} />
        <AddFieldLink target="item" />
      </FieldGroup>
      <FormFooter>
        <Button
          type="submit"
          size="xl"
          className="flex-1"
          disabled={saving || !name.trim()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
      </FormFooter>
    </form>
  )
}
