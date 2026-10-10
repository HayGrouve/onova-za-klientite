import { cn } from 'cn'
import { useRef } from 'react'
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
  size = 'md',
  selectOnFocus = false,
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
  /** `lg` is the one question of a step: a large, light figure. */
  size?: 'md' | 'lg'
  /** Selects a prefilled amount on focus, so typing replaces it. */
  selectOnFocus?: boolean
}) {
  const wide = useWide()
  const large = size === 'lg'
  // The click that focused the field would otherwise drop the selection on
  // release and leave a caret instead.
  const justFocused = useRef(false)
  return (
    <InputGroup className={cn(large && 'h-16')}>
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
        onFocus={(event) => {
          if (!selectOnFocus) return
          justFocused.current = true
          event.currentTarget.select()
        }}
        onMouseUp={(event) => {
          if (!justFocused.current) return
          justFocused.current = false
          event.preventDefault()
        }}
        onKeyDown={() => (justFocused.current = false)}
        onBlur={() => (justFocused.current = false)}
        className={cn(
          large &&
            'h-16 text-[2.125rem] font-light tracking-tight tabular-nums md:text-[2.125rem]',
        )}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText className={cn(large && 'text-2xl font-light')}>
          €
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
