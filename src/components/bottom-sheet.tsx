import { cn } from 'cn'
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
  hideTitle = false,
  children,
}: {
  open: boolean
  /** Asked to close: a tap outside, Esc or the close button. */
  onClose: () => void
  title: React.ReactNode
  /** The title is only for screen readers: a stepped form asks its own question (D117). */
  hideTitle?: boolean
  children: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader className={cn(hideTitle && 'sr-only')}>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
