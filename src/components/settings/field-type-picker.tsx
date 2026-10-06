import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { m } from '#/paraglide/messages.js'
import { FIELD_TYPES } from '../../../shared/fields'
import type { FieldType } from '../../../shared/fields'

export const FIELD_TYPE_LABEL: Record<FieldType, () => string> = {
  text: m.field_type_text,
  longText: m.field_type_longText,
  number: m.field_type_number,
  money: m.field_type_money,
  date: m.field_type_date,
  yesNo: m.field_type_yesNo,
  choice: m.field_type_choice,
  photo: m.field_type_photo,
}

/** The eight field types as one wrapping row of toggles. */
export function FieldTypePicker({
  value,
  onChange,
  isDisabled,
}: {
  value: FieldType
  onChange: (type: FieldType) => void
  isDisabled?: (type: FieldType) => boolean
}) {
  return (
    <ToggleGroup
      aria-label={m.fields_settings_type()}
      value={[value]}
      onValueChange={(next: string[]) => {
        if (next[0]) onChange(next[0] as FieldType)
      }}
      variant="outline"
      size="xl"
      className="w-full flex-wrap"
    >
      {FIELD_TYPES.map((type) => (
        <ToggleGroupItem
          key={type}
          value={type}
          disabled={isDisabled?.(type)}
          className="aria-pressed:border-primary aria-pressed:bg-primary/8"
        >
          {FIELD_TYPE_LABEL[type]()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
