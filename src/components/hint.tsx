import { InfoIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'
import { m } from '#/paraglide/messages.js'

/**
 * A small "i" next to a term that opens a short explanation. Opens on tap,
 * so it works on phones, where tooltips don't.
 */
export function Hint({
  term,
  children,
  className,
}: {
  term: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={m.hint_open({ term })}
        className={cn(
          // The visible circle is small; the ::after keeps the tap target at 44 px.
          'relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 transition-colors outline-none after:absolute after:-inset-2.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:text-primary',
          className,
        )}
      >
        <InfoIcon className="size-4" weight="bold" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-64 gap-1 rounded-xl p-3 leading-snug shadow-lg"
      >
        <PopoverTitle>{term}</PopoverTitle>
        <PopoverDescription>{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
