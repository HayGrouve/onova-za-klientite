import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { m } from '#/paraglide/messages.js'
import type { FieldType } from '../../../shared/fields'

type Target = 'client' | 'job' | 'item'

/** The "add a field" form in a bottom sheet. Used by Settings and by the "+ field" link. */
export function AddFieldSheet({
  businessId,
  target,
  targetName,
  open,
  onOpenChange,
}: {
  businessId: Id<'businesses'>
  target: Target
  targetName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>{m.fields_settings_add_title()}</SheetTitle>
          <SheetDescription>
            {m.fields_settings_add_for({ name: targetName })}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <AddFieldForm
            businessId={businessId}
            target={target}
            onDone={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddFieldForm({
  businessId,
  target,
  onDone,
}: {
  businessId: Id<'businesses'>
  target: Target
  onDone: () => void
}) {
  const add = useMutation(api.fields.add)
  const { busy, run } = useSubmit(onDone)
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [options, setOptions] = useState<string[]>([''])
  const [showInList, setShowInList] = useState(false)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        // React bubbles submit through the portal to a parent <form>, e.g. the
        // record form this sheet was opened from. It must not save that one.
        event.stopPropagation()
        event.preventDefault()
        if (!name.trim()) return
        void run(() =>
          add({
            businessId,
            target,
            name,
            type,
            options:
              type === 'choice'
                ? options.map((option) => option.trim()).filter(Boolean)
                : undefined,
            showInList,
          }),
        )
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-field-name">
            {m.fields_settings_name()}
          </FieldLabel>
          <Input
            id="new-field-name"
            required
            autoFocus
            maxLength={60}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{m.fields_settings_type()}</FieldLabel>
          <FieldTypePicker value={type} onChange={setType} />
          <FieldDescription>{m.fields_settings_type_after()}</FieldDescription>
        </Field>
        {type === 'choice' && (
          <Field>
            <FieldLabel>{m.fields_settings_options()}</FieldLabel>
            <div className="flex flex-col gap-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    aria-label={m.fields_settings_option_name()}
                    maxLength={60}
                    autoComplete="off"
                    value={option}
                    onChange={(event) =>
                      setOptions(
                        options.map((item, i) =>
                          i === index ? event.target.value : item,
                        ),
                      )
                    }
                  />
                  {options.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xl"
                      aria-label={m.remove()}
                      onClick={() =>
                        setOptions(options.filter((_, i) => i !== index))
                      }
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 50 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-fit"
                  onClick={() => setOptions([...options, ''])}
                >
                  <PlusIcon data-icon="inline-start" />
                  {m.fields_settings_option_add()}
                </Button>
              )}
            </div>
          </Field>
        )}
        <Field orientation="horizontal">
          <FieldLabel htmlFor="new-field-list">
            {m.fields_settings_show_in_list()}
          </FieldLabel>
          <Switch
            id="new-field-list"
            checked={showInList}
            onCheckedChange={setShowInList}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" size="xl" disabled={busy || !name.trim()}>
        {busy && <Spinner data-icon="inline-start" />}
        {m.fields_settings_add_submit()}
      </Button>
    </form>
  )
}
