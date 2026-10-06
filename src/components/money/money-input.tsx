import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
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
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        autoFocus={autoFocus}
        aria-label={label}
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
