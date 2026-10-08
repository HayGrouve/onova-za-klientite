import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { useWide } from '#/hooks/use-wide'
import { formatMoney } from '../../../shared/money'

/** The digits of an amount for an input: 1200,5 → "1200,50", without the € sign. */
export function moneyInputText(cents: number | null | undefined) {
  return cents === null || cents === undefined
    ? ''
    : formatMoney(cents).replace(/\s?€/, '')
}

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
