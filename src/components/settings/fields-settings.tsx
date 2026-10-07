import { CaretDownIcon, ListBulletsIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery } from 'convex/react'
import { cn } from 'cn'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { ListSkeleton } from '#/components/list-skeleton'
import { AddFieldSheet } from '#/components/settings/field-add-sheet'
import { FieldEditSheet } from '#/components/settings/field-edit-sheet'
import { FIELD_TYPE_LABEL } from '#/components/settings/field-type-picker'
import { Button } from '#/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { ExtraFieldsEditor } from '#/components/extra-fields'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { lower } from '#/i18n/words'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

type Target = Doc<'fields'>['target']
const TARGETS: Target[] = ['client', 'job', 'item']

function FieldRow({
  field,
  onOpen,
}: {
  field: Doc<'fields'>
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 surface pressable px-4 py-2 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate font-medium',
            field.archivedAt !== undefined && 'text-muted-foreground',
          )}
        >
          {field.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {FIELD_TYPE_LABEL[field.type]()}
        </span>
      </span>
      {field.showInList && (
        <span
          className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground"
          title={m.fields_settings_in_list_title()}
        >
          <ListBulletsIcon className="size-4" />
          {m.fields_settings_in_list()}
        </span>
      )}
    </button>
  )
}

/** Settings → Fields: the extra fields of clients, jobs and items, with archive and options. */
export function FieldsSettings({
  businessId,
  initialTarget,
}: {
  businessId: Id<'businesses'>
  initialTarget?: Target
}) {
  const { business } = useViewer()
  const clientFields = useQuery(api.fields.list, {
    businessId,
    target: 'client',
    includeArchived: true,
  })
  const jobFields = useQuery(api.fields.list, {
    businessId,
    target: 'job',
    includeArchived: true,
  })
  const itemFields = useQuery(api.fields.list, {
    businessId,
    target: 'item',
    includeArchived: true,
  })
  const byTarget = {
    client: clientFields,
    job: jobFields,
    item: itemFields,
  }
  const [selected, setSelected] = useState<Target>(initialTarget ?? 'client')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<Id<'fields'> | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const visibleTargets = TARGETS.filter(
    (target) =>
      target !== 'item' ||
      business.modules.items ||
      (itemFields !== undefined && itemFields.length > 0),
  )
  const target = visibleTargets.includes(selected) ? selected : 'client'
  const fields = byTarget[target]
  const active = fields?.filter((field) => field.archivedAt === undefined)
  const archived = fields?.filter((field) => field.archivedAt !== undefined)
  const editing = [clientFields, jobFields, itemFields]
    .flatMap((list) => list ?? [])
    .find((field) => field._id === editingId)

  return (
    <SettingsPage
      title={m.fields_settings_title()}
      help={m.fields_settings_help()}
      preview={
        active && (
          <SettingsPreview
            title={m.fields_preview_title({
              name: lower(business.words[target].singular),
            })}
          >
            <RecordFormPreview
              target={target}
              fields={active}
              name={business.words[target].singular}
            />
          </SettingsPreview>
        )
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Tabs
          value={target}
          onValueChange={(value) => {
            setSelected(value as Target)
            setShowArchived(false)
          }}
        >
          <TabsList className="h-11 w-full">
            {visibleTargets.map((item) => (
              <TabsTrigger key={item} value={item} className="px-2 text-base">
                {business.words[item].plural}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {!fields ? (
          <ListSkeleton />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {active?.map((field) => (
                <FieldRow
                  key={field._id}
                  field={field}
                  onOpen={() => setEditingId(field._id)}
                />
              ))}
              {active?.length === 0 && (
                <p className="px-1 py-4 text-center text-muted-foreground">
                  {m.fields_settings_empty()}
                </p>
              )}
            </div>
            <Button
              type="button"
              size="xl"
              variant="outline"
              onClick={() => setAdding(true)}
            >
              <PlusIcon data-icon="inline-start" />
              {m.fields_settings_add()}
            </Button>
            {archived && archived.length > 0 && (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-fit"
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <CaretDownIcon
                    data-icon="inline-start"
                    className={cn(!showArchived && '-rotate-90')}
                  />
                  {m.fields_settings_archived({ count: archived.length })}
                </Button>
                {showArchived &&
                  archived.map((field) => (
                    <FieldRow
                      key={field._id}
                      field={field}
                      onOpen={() => setEditingId(field._id)}
                    />
                  ))}
              </div>
            )}
          </>
        )}

        <AddFieldSheet
          businessId={businessId}
          target={target}
          targetName={business.words[target].plural}
          open={adding}
          onOpenChange={setAdding}
        />
        <FieldEditSheet
          businessId={businessId}
          field={editing}
          onClose={() => setEditingId(null)}
        />
      </div>
    </SettingsPage>
  )
}

/** The fields every record has, before the extra ones. */
const BASE_FIELDS: Record<Target, Array<() => string>> = {
  client: [m.client_name, m.client_phones],
  job: [m.job_title, m.job_price],
  item: [m.item_name],
}

/**
 * The record's form with its extra fields, drawn with the real inputs but
 * inert, and a list row with the fields shown there.
 */
function RecordFormPreview({
  target,
  fields,
  name,
}: {
  target: Target
  fields: Array<Doc<'fields'>>
  name: string
}) {
  const inList = fields.filter((field) => field.showInList)
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-3">
        {BASE_FIELDS[target].map((label) => (
          <div key={label()} className="flex flex-col gap-1.5 opacity-50">
            <span className="font-medium">{label()}</span>
            <span className="h-9 rounded-xl border" />
          </div>
        ))}
        <Flash
          watch={fields.map((field) => [
            field._id,
            field.name,
            field.type,
            field.options?.map((option) => option.name),
          ])}
          className="py-1"
        >
          {fields.some((field) => field.type !== 'photo') ? (
            <div inert className="flex flex-col gap-4">
              <ExtraFieldsEditor
                fields={fields}
                values={{}}
                onChange={() => {}}
              />
            </div>
          ) : (
            <p className="py-1 text-muted-foreground">
              {m.fields_preview_none()}
            </p>
          )}
        </Flash>
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-medium">{m.fields_preview_list()}</p>
        <Flash
          watch={inList.map((field) => field.name)}
          className="flex flex-col gap-1 rounded-xl border px-3 py-2"
        >
          <span className="font-medium">{name}</span>
          {inList.length > 0 ? (
            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {inList.map((field) => (
                <span key={field._id}>{field.name}: …</span>
              ))}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {m.fields_preview_list_none()}
            </span>
          )}
        </Flash>
      </div>
    </div>
  )
}
