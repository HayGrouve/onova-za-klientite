import { cn } from 'cn'

// In a dialog (a Sheet) on a wide screen, the footer sticks to the dialog's
// bottom edge. It reaches over the dialog's bottom padding (-mb-6, under
// `px-4 pb-6`), so it doesn't shift when the end of the form scrolls into view.
const IN_DIALOG =
  'lg:in-data-[slot=sheet-content]:sticky lg:in-data-[slot=sheet-content]:bottom-0 lg:in-data-[slot=sheet-content]:z-10 lg:in-data-[slot=sheet-content]:-mx-4 lg:in-data-[slot=sheet-content]:-mb-6 lg:in-data-[slot=sheet-content]:border-t lg:in-data-[slot=sheet-content]:border-border/70 lg:in-data-[slot=sheet-content]:bg-popover lg:in-data-[slot=sheet-content]:px-4 lg:in-data-[slot=sheet-content]:py-3'

/**
 * The action row at the end of a long form. In a dialog on a wide screen it
 * stays in view while the fields scroll, so Save is never below the fold.
 * Anywhere else, and on a phone, it is just the row.
 */
export function FormFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('flex gap-2', IN_DIALOG, className)} {...props} />
}
