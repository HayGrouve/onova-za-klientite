import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ExtraFieldsEditor } from '#/components/extra-fields'
import type { ExtraValues } from '#/components/extra-fields'
import { AddFieldLink } from '#/components/settings/add-field-link'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { formatPhone, normalizePhone } from '../../shared/phone'

type ClientDoc = Doc<'clients'>

/** Values of the given (active) fields only: archived values stay on the server untouched. */
export function activeValues(
  fields: Array<Doc<'fields'>>,
  values: ExtraValues,
) {
  const result: ExtraValues = {}
  for (const field of fields) {
    if (field._id in values) result[field._id] = values[field._id]
  }
  return result
}

/** Create or edit a client: name, phones, contacts, note and extra fields. */
export function ClientForm({
  businessId,
  client,
  fields,
  onSaved,
}: {
  businessId: Id<'businesses'>
  client?: ClientDoc
  fields: Array<Doc<'fields'>>
  onSaved: (clientId: Id<'clients'>) => void
}) {
  const create = useMutation(api.clients.create)
  const update = useMutation(api.clients.update)
  const [name, setName] = useState(client?.name ?? '')
  const [kind, setKind] = useState<ClientDoc['kind']>(client?.kind ?? 'person')
  const [phones, setPhones] = useState<string[]>(
    client?.phones.length
      ? client.phones.map((phone) => formatPhone(phone.e164))
      : [''],
  )
  const [email, setEmail] = useState(client?.email ?? '')
  const [address, setAddress] = useState(client?.address ?? '')
  const [note, setNote] = useState(client?.note ?? '')
  const [extra, setExtra] = useState<ExtraValues>(client?.extra ?? {})
  const [saving, setSaving] = useState(false)
  const typedPhones = phones
    .map((phone) => normalizePhone(phone))
    .filter((phone): phone is string => phone !== null)
  const duplicates = useQuery(
    api.clientsAdmin.findByPhones,
    typedPhones.length
      ? { businessId, phones: typedPhones, exceptClientId: client?._id }
      : 'skip',
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const values = {
      name,
      kind,
      phones: phones
        .filter((phone) => phone.trim())
        .map((number) => ({ number })),
      email,
      address,
      note,
      extra: activeValues(fields, extra),
    }
    try {
      if (client) {
        await update({ businessId, clientId: client._id, ...values })
        onSaved(client._id)
      } else {
        onSaved(await create({ businessId, ...values }))
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
          <FieldLabel htmlFor="client-name">{m.client_name()}</FieldLabel>
          <Input
            id="client-name"
            required
            autoFocus={!client}
            maxLength={120}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ToggleGroup
          aria-label={m.client_name()}
          value={[kind]}
          onValueChange={(next: string[]) => {
            if (next[0]) setKind(next[0] as ClientDoc['kind'])
          }}
          variant="outline"
          size="xl"
        >
          <ToggleGroupItem
            value="person"
            className="aria-pressed:border-primary aria-pressed:bg-primary/8"
          >
            {m.client_kind_person()}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="company"
            className="aria-pressed:border-primary aria-pressed:bg-primary/8"
          >
            {m.client_kind_company()}
          </ToggleGroupItem>
        </ToggleGroup>
        <Field>
          <FieldLabel>{m.client_phones()}</FieldLabel>
          <div className="flex flex-col gap-2">
            {phones.map((phone, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  aria-label={m.client_phone()}
                  value={phone}
                  onChange={(event) =>
                    setPhones(
                      phones.map((item, i) =>
                        i === index ? event.target.value : item,
                      ),
                    )
                  }
                />
                {phones.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xl"
                    aria-label={m.remove()}
                    onClick={() =>
                      setPhones(phones.filter((_, i) => i !== index))
                    }
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            {duplicates?.map((duplicate) => (
              <p
                key={duplicate._id}
                className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400"
              >
                {m.duplicate_warning({ name: duplicate.name })}
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: duplicate._id }}
                  className="font-medium underline underline-offset-4"
                >
                  {m.duplicate_open()}
                </Link>
              </p>
            ))}
            {phones.length < 5 && (
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-fit"
                onClick={() => setPhones([...phones, ''])}
              >
                <PlusIcon data-icon="inline-start" />
                {m.client_add_phone()}
              </Button>
            )}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="client-email">{m.client_email()}</FieldLabel>
          <Input
            id="client-email"
            type="email"
            maxLength={200}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="client-address">{m.client_address()}</FieldLabel>
          <Input
            id="client-address"
            maxLength={500}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <ExtraFieldsEditor fields={fields} values={extra} onChange={setExtra} />
        <AddFieldLink target="client" />
        <Field>
          <FieldLabel htmlFor="client-note">{m.client_note()}</FieldLabel>
          <Textarea
            id="client-note"
            rows={3}
            className="rounded-xl"
            maxLength={5000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" size="xl" disabled={saving || !name.trim()}>
        {saving && <Spinner data-icon="inline-start" />}
        {m.client_save()}
      </Button>
    </form>
  )
}
