import { ArrowCounterClockwiseIcon, PlusIcon } from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useSubmit } from '#/components/money/use-submit'
import { FieldTypePicker } from '#/components/settings/field-type-picker'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { canChangeFieldType } from '../../../shared/fields'
import type { FieldType } from '../../../shared/fields'

type FieldDoc = Doc<'fields'>

/** Change one field: name, text/long text type, list toggle, choice options, archive. */
export function FieldEditSheet({
  businessId,
  field,
  onClose,
}: {
  businessId: Id<'businesses'>
  field: FieldDoc | undefined
  onClose: () => void
}) {
  return (
    <Sheet
      open={field !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>{field?.name}</SheetTitle>
        </SheetHeader>
        {field && (
          <div className="flex flex-col gap-6 px-4 pb-6">
            <FieldDetails
              key={field._id}
              businessId={businessId}
              field={field}
              onDone={onClose}
            />
            {field.type === 'choice' && (
              <OptionsList businessId={businessId} field={field} />
            )}
            <ArchiveBlock
              businessId={businessId}
              field={field}
              onDone={onClose}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FieldDetails({
  businessId,
  field,
  onDone,
}: {
  businessId: Id<'businesses'>
  field: FieldDoc
  onDone: () => void
}) {
  const update = useMutation(api.fields.update)
  const { busy, run } = useSubmit(onDone)
  const [name, setName] = useState(field.name)
  const [type, setType] = useState<FieldType>(field.type)
  const [showInList, setShowInList] = useState(field.showInList)
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim()) return
        void run(() =>
          update({
            businessId,
            fieldId: field._id,
            name,
            type: type === field.type ? undefined : type,
            showInList,
          }),
        )
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="field-name">
            {m.fields_settings_name()}
          </FieldLabel>
          <Input
            id="field-name"
            required
            maxLength={60}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{m.fields_settings_type()}</FieldLabel>
          <FieldTypePicker
            value={type}
            onChange={setType}
            isDisabled={(next) => !canChangeFieldType(field.type, next)}
          />
          <FieldDescription>{m.fields_settings_type_locked()}</FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="field-list">
            {m.fields_settings_show_in_list()}
          </FieldLabel>
          <Switch
            id="field-list"
            checked={showInList}
            onCheckedChange={setShowInList}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" size="xl" disabled={busy || !name.trim()}>
        {busy && <Spinner data-icon="inline-start" />}
        {m.save()}
      </Button>
    </form>
  )
}

function OptionsList({
  businessId,
  field,
}: {
  businessId: Id<'businesses'>
  field: FieldDoc
}) {
  const addOption = useMutation(api.fields.addOption)
  const updateOption = useMutation(api.fields.updateOption)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const options = field.options ?? []

  const save = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      toast.success(m.saved())
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">{m.fields_settings_options()}</h3>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <OptionRow
            key={option.id}
            name={option.name}
            archived={option.archivedAt !== undefined}
            busy={busy}
            onRename={(name) =>
              save(() =>
                updateOption({
                  businessId,
                  fieldId: field._id,
                  optionId: option.id,
                  name,
                }),
              )
            }
            onToggleArchived={() =>
              save(() =>
                updateOption({
                  businessId,
                  fieldId: field._id,
                  optionId: option.id,
                  archived: option.archivedAt === undefined,
                }),
              )
            }
          />
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const name = draft.trim()
          if (!name) return
          void save(async () => {
            await addOption({ businessId, fieldId: field._id, name })
            setDraft('')
          })
        }}
      >
        <Input
          aria-label={m.fields_settings_option_name()}
          placeholder={m.fields_settings_option_placeholder()}
          maxLength={60}
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 rounded-xl"
          disabled={busy || !draft.trim()}
        >
          <PlusIcon data-icon="inline-start" />
          {m.fields_settings_option_add()}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {m.fields_settings_option_hint()}
      </p>
    </section>
  )
}

/** A rename saves on Enter or when the box loses focus. */
function OptionRow({
  name,
  archived,
  busy,
  onRename,
  onToggleArchived,
}: {
  name: string
  archived: boolean
  busy: boolean
  onRename: (name: string) => Promise<void>
  onToggleArchived: () => Promise<void>
}) {
  const [text, setText] = useState(name)
  const commit = () => {
    const next = text.trim()
    if (!next) setText(name)
    else if (next !== name) void onRename(next)
  }
  return (
    <div className="flex gap-2">
      <Input
        aria-label={m.fields_settings_option_name()}
        maxLength={60}
        autoComplete="off"
        disabled={archived}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        className="h-11 rounded-xl"
        disabled={busy}
        onClick={() => void onToggleArchived()}
      >
        {archived && <ArrowCounterClockwiseIcon data-icon="inline-start" />}
        {archived
          ? m.fields_settings_option_restore()
          : m.fields_settings_option_archive()}
      </Button>
    </div>
  )
}

function ArchiveBlock({
  businessId,
  field,
  onDone,
}: {
  businessId: Id<'businesses'>
  field: FieldDoc
  onDone: () => void
}) {
  const archive = useMutation(api.fields.archive)
  const restore = useMutation(api.fields.restore)
  const { busy, run } = useSubmit(onDone)
  const archived = field.archivedAt !== undefined
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <Button
        type="button"
        size="xl"
        variant={archived ? 'default' : 'outline'}
        disabled={busy}
        onClick={() =>
          void run(() =>
            archived
              ? restore({ businessId, fieldId: field._id })
              : archive({ businessId, fieldId: field._id }),
          )
        }
      >
        {busy && <Spinner data-icon="inline-start" />}
        {archived ? m.fields_settings_restore() : m.fields_settings_archive()}
      </Button>
      <p className="text-sm text-muted-foreground">
        {archived
          ? m.fields_settings_restore_hint()
          : m.fields_settings_archive_hint()}
      </p>
    </section>
  )
}
