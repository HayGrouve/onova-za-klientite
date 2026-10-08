import type { Doc } from '../../convex/_generated/dataModel'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { formatMoney, parseMoney } from '../../shared/money'

type FieldDoc = Doc<'fields'>
export type ExtraValues = Record<string, string | number | boolean>

/** A stored value as text, or null when there is nothing to show. */
export function formatFieldValue(
  field: FieldDoc,
  value: unknown,
  today: string,
): string | null {
  if (value === undefined || value === '') return null
  switch (field.type) {
    case 'text':
    case 'longText':
      return String(value)
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('bg-BG') : null
    case 'money':
      return typeof value === 'number' ? formatMoney(value) : null
    case 'date':
      return typeof value === 'string' ? formatDay(value, today) : null
    case 'yesNo':
      return value === true ? m.yes() : m.no()
    case 'choice':
      return field.options?.find((option) => option.id === value)?.name ?? null
    case 'photo':
      return null
  }
}

/** Label and value of each filled-in extra field. */
export function ExtraFieldsView({
  fields,
  values,
  today,
}: {
  fields: FieldDoc[]
  values: ExtraValues
  today: string
}) {
  const rows = fields
    .map((field) => ({
      field,
      text: formatFieldValue(field, values[field._id], today),
    }))
    .filter(
      (row): row is { field: FieldDoc; text: string } => row.text !== null,
    )
  if (rows.length === 0) return null
  return (
    <dl className="mx-4 flex flex-col divide-y divide-border/70 overflow-hidden surface">
      {rows.map(({ field, text }) => (
        <div key={field._id} className="flex gap-3 px-4 py-2.5">
          <dt className="w-28 shrink-0 text-sm text-muted-foreground">
            {field.name}
          </dt>
          <dd className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Inputs for a record's active extra fields. Photo fields are edited where
 * files are (the gallery), so they are left out here.
 */
export function ExtraFieldsEditor({
  fields,
  values,
  onChange,
}: {
  fields: FieldDoc[]
  values: ExtraValues
  onChange: (values: ExtraValues) => void
}) {
  const set = (
    fieldId: string,
    value: string | number | boolean | undefined,
  ) => {
    const next = { ...values }
    if (value === undefined || value === '') delete next[fieldId]
    else next[fieldId] = value
    onChange(next)
  }
  return (
    <>
      {fields
        .filter((field) => field.type !== 'photo')
        .map((field) => {
          const id = `field-${field._id}`
          const value = values[field._id]
          switch (field.type) {
            case 'text':
              return (
                <Field key={field._id}>
                  <FieldLabel htmlFor={id}>{field.name}</FieldLabel>
                  <Input
                    id={id}
                    maxLength={500}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => set(field._id, event.target.value)}
                  />
                </Field>
              )
            case 'longText':
              return (
                <Field key={field._id}>
                  <FieldLabel htmlFor={id}>{field.name}</FieldLabel>
                  <Textarea
                    id={id}
                    rows={3}
                    className="rounded-xl"
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => set(field._id, event.target.value)}
                  />
                </Field>
              )
            case 'number':
              return (
                <Field key={field._id}>
                  <FieldLabel htmlFor={id}>{field.name}</FieldLabel>
                  <Input
                    id={id}
                    inputMode="decimal"
                    defaultValue={
                      typeof value === 'number' ? String(value) : ''
                    }
                    onChange={(event) => {
                      const text = event.target.value
                        .replace(/\s/g, '')
                        .replace(',', '.')
                      const number = Number(text)
                      set(
                        field._id,
                        text === '' || !Number.isFinite(number)
                          ? undefined
                          : number,
                      )
                    }}
                  />
                </Field>
              )
            case 'money':
              return (
                <Field key={field._id}>
                  <FieldLabel htmlFor={id}>{field.name}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={id}
                      inputMode="decimal"
                      defaultValue={
                        typeof value === 'number'
                          ? formatMoney(value).replace(/\s?€/, '')
                          : ''
                      }
                      onChange={(event) =>
                        set(
                          field._id,
                          parseMoney(event.target.value) ?? undefined,
                        )
                      }
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>€</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              )
            case 'date':
              return (
                <Field key={field._id}>
                  <FieldLabel htmlFor={id}>{field.name}</FieldLabel>
                  <Input
                    id={id}
                    type="date"
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => set(field._id, event.target.value)}
                  />
                </Field>
              )
            case 'yesNo':
              return (
                <Field key={field._id} orientation="horizontal">
                  <FieldLabel htmlFor={id}>{field.name}</FieldLabel>
                  <Switch
                    id={id}
                    checked={value === true}
                    onCheckedChange={(checked) => set(field._id, checked)}
                  />
                </Field>
              )
            case 'choice':
              return (
                <Field key={field._id}>
                  <FieldLabel>{field.name}</FieldLabel>
                  <ToggleGroup
                    aria-label={field.name}
                    value={typeof value === 'string' ? [value] : []}
                    onValueChange={(next: string[]) => set(field._id, next[0])}
                    variant="outline"
                    size="xl"
                    className="w-full flex-wrap"
                  >
                    {(field.options ?? [])
                      .filter(
                        (option) =>
                          option.archivedAt === undefined ||
                          option.id === value,
                      )
                      .map((option) => (
                        <ToggleGroupItem key={option.id} value={option.id}>
                          {option.name}
                        </ToggleGroupItem>
                      ))}
                  </ToggleGroup>
                </Field>
              )
            case 'photo':
              return null
          }
        })}
    </>
  )
}
