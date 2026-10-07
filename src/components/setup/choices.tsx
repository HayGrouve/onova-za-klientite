import { CheckCircleIcon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'

export type Choice = {
  value: string
  label: string
  description?: string
  icon?: Icon
}

/** Single or multiple choice. `list` is full-width rows, `wrap` is chips. */
export function Choices({
  choices,
  value,
  onChange,
  layout = 'list',
  multiple = false,
  label,
}: {
  choices: Choice[]
  value: string[]
  onChange: (value: string[]) => void
  layout?: 'list' | 'wrap'
  multiple?: boolean
  label: string
}) {
  return (
    <ToggleGroup
      aria-label={label}
      multiple={multiple}
      value={value}
      onValueChange={(next: string[]) => {
        // Tapping the chosen option again keeps it chosen.
        if (!multiple && next.length === 0) return
        onChange(next)
      }}
      variant="outline"
      size="xl"
      orientation={layout === 'list' ? 'vertical' : 'horizontal'}
      className={cn(layout === 'list' ? 'w-full' : 'w-full flex-wrap')}
    >
      {choices.map((choice) => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          // The list draws its own check at the end of the row.
          check={layout === 'wrap'}
          className={cn(
            layout === 'list' &&
              'h-auto min-h-14 w-full justify-start gap-3 px-4 py-3 text-left whitespace-normal',
          )}
        >
          {choice.icon && <choice.icon className="size-5 shrink-0" />}
          {layout === 'list' ? (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{choice.label}</span>
              {choice.description && (
                <span className="text-sm font-normal text-muted-foreground">
                  {choice.description}
                </span>
              )}
            </span>
          ) : (
            choice.label
          )}
          {layout === 'list' && (
            <CheckCircleIcon
              weight="fill"
              className="size-5 shrink-0 text-primary opacity-0 group-aria-pressed/toggle:opacity-100"
            />
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
