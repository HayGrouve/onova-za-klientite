import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { useWide } from '#/hooks/use-wide'

export function MoneyInput({
  id,
  label,
  value,
  onChange,
  autoFocus,
  name = 'amount',
  invalid,
  describedBy,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  /** Focuses the field on a wide screen only: on a phone it would open the keyboard over the form. */
  autoFocus?: boolean
  name?: string
  invalid?: boolean
  describedBy?: string
}) {
  const wide = useWide()
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={name}
        autoFocus={autoFocus && wide}
        spellCheck={false}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        inputMode="decimal"
        maxLength={14}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>€</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
