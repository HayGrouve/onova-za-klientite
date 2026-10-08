import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'

/** A sheet from the bottom with a title, scrolling when its form is long. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  /** Asked to close: a tap outside, Esc or the close button. */
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
