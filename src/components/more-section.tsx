import { CaretDownIcon, DotsThreeOutlineIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { m } from '#/paraglide/messages.js'

const KEY = 'more-open:'

function readOpen(page: string) {
  try {
    return localStorage.getItem(KEY + page) === 'true'
  } catch {
    return false
  }
}

/**
 * The rest of a detail page, folded under one "More" card so the page opens
 * on its few main actions. The card names what is inside. Opening it is
 * remembered per kind of page, so someone who always works in the details
 * finds them open next time.
 */
export function MoreSection({
  page,
  summary,
  children,
}: {
  /** Which kind of page, so a job and a client remember apart. */
  page: 'job' | 'client' | 'item'
  /** The parts inside, by name, shown on the card while it is closed. */
  summary: string[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() => readOpen(page))
  const change = (next: boolean) => {
    try {
      localStorage.setItem(KEY + page, String(next))
    } catch {
      // Storage can be off (private mode): it just starts closed next time.
    }
    setOpen(next)
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={change}
      className="flex flex-col gap-4"
    >
      <CollapsibleTrigger className="mx-4 flex min-h-14 animate-rise items-center gap-3 surface pressable px-4 py-2 text-left">
        <DotsThreeOutlineIcon
          aria-hidden
          weight="fill"
          className="size-5 shrink-0 text-muted-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">
            {open ? m.more_hide() : m.more_show()}
          </span>
          {!open && summary.length > 0 && (
            <span className="line-clamp-2 text-sm text-muted-foreground">
              {summary.join(' · ')}
            </span>
          )}
        </span>
        <CaretDownIcon
          aria-hidden
          className={cn(
            'size-5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
