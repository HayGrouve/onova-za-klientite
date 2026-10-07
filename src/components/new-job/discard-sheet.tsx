import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { m } from '#/paraglide/messages.js'

/** Asked before closing "+" with a line typed, so a stray tap doesn't lose it. */
export function DiscardSheet({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onKeep()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{m.new_discard_title()}</SheetTitle>
          <SheetDescription>{m.new_discard_body()}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <Button size="xl" onClick={onKeep}>
            {m.new_keep_writing()}
          </Button>
          <Button size="xl" variant="outline" onClick={onDiscard}>
            {m.new_discard()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
