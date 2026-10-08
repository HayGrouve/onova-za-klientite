import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { m } from '#/paraglide/messages.js'

/**
 * Asked before unsaved changes are thrown away, so a stray tap doesn't lose
 * them. "+" passes its own words; every other form uses the general ones.
 */
export function DiscardSheet({
  open,
  onKeep,
  onDiscard,
  title = m.discard_title(),
  body = m.discard_body(),
  discardLabel = m.discard(),
  keepLabel = m.keep_editing(),
}: {
  open: boolean
  onKeep: () => void
  onDiscard: () => void
  title?: string
  body?: string
  discardLabel?: string
  keepLabel?: string
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onKeep()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <Button size="xl" onClick={onKeep}>
            {keepLabel}
          </Button>
          <Button size="xl" variant="outline" onClick={onDiscard}>
            {discardLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
