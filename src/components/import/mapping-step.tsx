import { useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '#/components/ui/native-select'
import { m } from '#/paraglide/messages.js'
import { detectTargets, foldName, mapRows } from '../../../shared/import'
import type { ColumnTarget, ImportRow, Table } from '../../../shared/import'

type FieldOption = { id: string; name: string }

/** Where a column's values go when it is an extra field: an existing one, or a new one. */
export type ColumnFields = Record<string, { id: string } | 'new'>

const BASIC: Array<[Exclude<ColumnTarget, 'extra'>, () => string]> = [
  ['name', m.import_target_name],
  ['lastName', m.import_target_lastName],
  ['phone', m.import_target_phone],
  ['email', m.import_target_email],
  ['address', m.import_target_address],
  ['note', m.import_target_note],
  ['company', m.import_target_company],
]

const FIELD_PREFIX = 'field:'

/** The first guess for a column: its detected meaning, or the field with its name, or a new field. */
function firstChoice(
  header: string,
  target: ColumnTarget,
  fields: FieldOption[],
  canAddFields: boolean,
): string {
  if (target !== 'extra') return target
  const same = fields.find((field) => foldName(field.name) === foldName(header))
  if (same) return `${FIELD_PREFIX}${same.id}`
  return canAddFields ? 'new' : 'skip'
}

/** Each column of the file, with what it becomes. Unknown columns can become new fields. */
export function MappingStep({
  table,
  fields,
  canAddFields,
  onBack,
  onDone,
}: {
  table: Table
  /** The business's existing client fields that take plain text. */
  fields: FieldOption[]
  canAddFields: boolean
  onBack: () => void
  onDone: (rows: ImportRow[], columnFields: ColumnFields) => void
}) {
  const [choices, setChoices] = useState(() =>
    detectTargets(table.headers).map((target, col) =>
      firstChoice(table.headers[col], target, fields, canAddFields),
    ),
  )

  const targets = useMemo(
    () =>
      choices.map((choice): ColumnTarget =>
        choice === 'new' || choice.startsWith(FIELD_PREFIX)
          ? 'extra'
          : (choice as ColumnTarget),
      ),
    [choices],
  )
  const canContinue = targets.some((target) =>
    ['name', 'company', 'phone'].includes(target),
  )

  const submit = () => {
    const columnFields: ColumnFields = {}
    choices.forEach((choice, col) => {
      if (choice === 'new') columnFields[table.headers[col]] = 'new'
      else if (choice.startsWith(FIELD_PREFIX)) {
        columnFields[table.headers[col]] = {
          id: choice.slice(FIELD_PREFIX.length),
        }
      }
    })
    onDone(mapRows(table, targets), columnFields)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-4">
        <h2 className="text-xl font-semibold">{m.import_map_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.import_map_help()}</p>
      </div>
      <ul className="flex flex-col gap-4 px-4">
        {table.headers.map((header, col) => {
          const example = table.rows.find((row) => row[col])?.[col]
          return (
            <li key={header} className="flex flex-col gap-1.5">
              <label htmlFor={`import-col-${col}`} className="font-medium">
                {header}
              </label>
              {example && (
                <span className="truncate text-sm text-muted-foreground">
                  {m.import_map_example({ value: example })}
                </span>
              )}
              <NativeSelect
                id={`import-col-${col}`}
                value={choices[col]}
                onChange={(event) =>
                  setChoices(
                    choices.map((choice, i) =>
                      i === col ? event.target.value : choice,
                    ),
                  )
                }
                className="w-full [&_select]:h-12 [&_select]:rounded-xl [&_select]:pr-9 [&_select]:pl-3 [&_select]:text-base"
              >
                <NativeSelectOptGroup label={m.import_group_basic()}>
                  {BASIC.map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label()}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
                {(fields.length > 0 || canAddFields) && (
                  <NativeSelectOptGroup label={m.import_group_fields()}>
                    {fields.map((field) => (
                      <NativeSelectOption
                        key={field.id}
                        value={`${FIELD_PREFIX}${field.id}`}
                      >
                        {field.name}
                      </NativeSelectOption>
                    ))}
                    {canAddFields && (
                      <NativeSelectOption value="new">
                        {m.import_target_new()}
                      </NativeSelectOption>
                    )}
                  </NativeSelectOptGroup>
                )}
                <NativeSelectOption value="skip">
                  {m.import_target_skip()}
                </NativeSelectOption>
              </NativeSelect>
            </li>
          )
        })}
      </ul>
      {!canContinue && (
        <p role="alert" className="px-4 text-sm text-destructive">
          {m.import_map_need_name()}
        </p>
      )}
      <div className="flex gap-3 px-4">
        <Button type="button" variant="outline" size="xl" onClick={onBack}>
          {m.import_back()}
        </Button>
        <Button
          type="button"
          size="xl"
          className="flex-1"
          disabled={!canContinue}
          onClick={submit}
        >
          {m.import_continue()}
        </Button>
      </div>
    </div>
  )
}
