import {
  BankIcon,
  CheckIcon,
  CreditCardIcon,
  DotsThreeIcon,
  MoneyIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'
import type { Doc } from '../../../convex/_generated/dataModel'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'

export type PaymentMethod = Doc<'payments'>['method']

const METHODS: PaymentMethod[] = ['cash', 'bank', 'card', 'other']

const METHOD_ICON: Record<PaymentMethod, Icon> = {
  cash: MoneyIcon,
  bank: BankIcon,
  card: CreditCardIcon,
  other: DotsThreeIcon,
}

export function MethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
}) {
  return (
    <ToggleGroup
      aria-label={m.pay_method()}
      value={[value]}
      onValueChange={(next: string[]) => {
        if (next[0]) onChange(next[0] as PaymentMethod)
      }}
      variant="outline"
      size="xl"
      className="w-full flex-wrap"
    >
      {METHODS.map((method) => (
        <ToggleGroupItem key={method} value={method}>
          {METHOD_LABEL[method]()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The methods as one large row each, for a step that asks only how the money
 * came (D117): the one chosen so far is marked, and a tap on any row picks it
 * and moves on.
 */
export function MethodRows({
  value,
  onPick,
}: {
  value: PaymentMethod
  onPick: (method: PaymentMethod) => void
}) {
  return (
    <div
      role="group"
      aria-label={m.pay_method()}
      className="flex flex-col gap-2"
    >
      {METHODS.map((method) => {
        const MethodIcon = METHOD_ICON[method]
        const chosen = method === value
        return (
          <button
            key={method}
            type="button"
            aria-pressed={chosen}
            onClick={() => onPick(method)}
            className={cn(
              'flex min-h-13 items-center gap-3 rounded-xl px-4 text-left text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent',
              chosen
                ? 'bg-accent font-medium ring-1 ring-primary/35'
                : 'bg-muted hover:bg-accent/60',
            )}
          >
            <MethodIcon
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1">{METHOD_LABEL[method]()}</span>
            {chosen && (
              <CheckIcon
                aria-hidden
                weight="bold"
                className="size-5 shrink-0 text-primary"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
