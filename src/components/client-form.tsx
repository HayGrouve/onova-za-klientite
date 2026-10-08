import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ExtraFieldsEditor } from '#/components/extra-fields'
import { FormFooter } from '#/components/form-footer'
import type { ExtraValues } from '#/components/extra-fields'
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
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useWide } from '#/hooks/use-wide'
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

/** The form's values as text, with object keys in a fixed order, to tell whether anything changed. */
export function snapshot(values: unknown): string {
  return JSON.stringify(values, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  )
}

/** Create or edit a client: name, phones, contacts, note and extra fields. */
export function ClientForm({
  businessId,
  client,
  fields,
  onSaved,
  onDirtyChange,
}: {
  businessId: Id<'businesses'>
  client?: ClientDoc
  fields: Array<Doc<'fields'>>
  onSaved: (clientId: Id<'clients'>) => void
  /** Tells the page or sheet whether there are unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void
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
  const [tried, setTried] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const wide = useWide()
  const current = snapshot({ name, kind, phones, email, address, note, extra })
  const [initial] = useState(current)
  const dirty = current !== initial
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  // A form that goes away has nothing left unsaved.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
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
    if (!name.trim()) {
      setTried(true)
      nameInput.current?.focus()
      return
    }
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
            ref={nameInput}
            id="client-name"
            name="name"
            autoFocus={!client && wide}
            maxLength={120}
            aria-invalid={tried && !name.trim()}
            aria-describedby={
              tried && !name.trim() ? 'client-name-error' : undefined
            }
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {tried && !name.trim() && (
            <FieldError id="client-name-error">{m.name_required()}</FieldError>
          )}
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
          <ToggleGroupItem value="person">
            {m.client_kind_person()}
          </ToggleGroupItem>
          <ToggleGroupItem value="company">
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
                  name="phone"
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
            <div role="status" className="flex flex-col gap-2">
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
            </div>
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
            name="email"
            type="email"
            spellCheck={false}
            maxLength={200}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="client-address">{m.client_address()}</FieldLabel>
          <Input
            id="client-address"
            name="address"
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
            name="note"
            rows={3}
            className="rounded-xl"
            maxLength={5000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <FormFooter>
        <Button type="submit" size="xl" className="flex-1" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {m.client_save()}
        </Button>
      </FormFooter>
    </form>
  )
}
