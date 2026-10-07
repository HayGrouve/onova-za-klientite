import type { Doc } from '../../../convex/_generated/dataModel'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'

export type PaymentMethod = Doc<'payments'>['method']

const METHODS: PaymentMethod[] = ['cash', 'bank', 'card', 'other']

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
