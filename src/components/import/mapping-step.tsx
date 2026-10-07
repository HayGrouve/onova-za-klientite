import { useMemo, useState } from 'react'
import { PreviewTable } from '#/components/import/preview-table'
import { Button } from '#/components/ui/button'
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '#/components/ui/native-select'
import { m } from '#/paraglide/messages.js'
import {
  FIELD_PREFIX,
  detectTargets,
  firstChoice,
  mapRows,
} from '../../../shared/import'
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

// The rows the live preview shows.
const PREVIEW_ROWS = 5

/**
 * Each column of the file, with what it becomes. A column the app doesn't
 * know is skipped until the person picks a field or "new field" for it. On a
 * wide screen the first rows are shown beside the columns as they would be
 * saved, and change with each choice.
 */
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
      firstChoice(table.headers[col], target, fields),
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
  const previewRows = useMemo(
    () =>
      mapRows(
        { headers: table.headers, rows: table.rows.slice(0, PREVIEW_ROWS * 2) },
        targets,
      )
        .slice(0, PREVIEW_ROWS)
        .map((row) => ({ row })),
    [table, targets],
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-x-8">
      <div className="flex flex-col gap-1 px-4 lg:col-span-2">
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
      {/* A wide screen: the first rows as they would be saved, beside the
          columns, changing with each choice. */}
      <aside
        aria-label={m.import_map_preview()}
        className="hidden flex-col gap-2 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-2 lg:flex"
      >
        <p className="text-sm font-medium text-muted-foreground">
          {m.import_map_preview()}
        </p>
        <PreviewTable rows={previewRows} />
      </aside>
    </div>
  )
}
