import { CheckIcon } from '@phosphor-icons/react'
import { Toggle } from '#/components/ui/toggle'
import { m } from '#/paraglide/messages.js'

/**
 * The two yes/no questions the books ask of the jobs: which still owe a
 * balance, and what is due this month. Chips, not a form: one tap each, and
 * both can be on.
 */
export function FilterChips({
  owing,
  dueThisMonth,
  onOwing,
  onDueThisMonth,
}: {
  owing: boolean
  dueThisMonth: boolean
  onOwing: (on: boolean) => void
  onDueThisMonth: (on: boolean) => void
}) {
  return (
    <div role="group" aria-label={m.jobs_filter()} className="flex gap-2">
      <Chip pressed={owing} onPressedChange={onOwing}>
        {m.jobs_filter_owing()}
      </Chip>
      <Chip pressed={dueThisMonth} onPressedChange={onDueThisMonth}>
        {m.jobs_filter_due_month()}
      </Chip>
    </div>
  )
}

function Chip({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean
  onPressedChange: (on: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Toggle
      variant="outline"
      pressed={pressed}
      onPressedChange={onPressedChange}
      className="h-9 rounded-full px-3.5 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
    >
      {pressed && <CheckIcon aria-hidden weight="bold" />}
      {children}
    </Toggle>
  )
}
