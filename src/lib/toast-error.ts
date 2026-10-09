import { toast } from 'sonner'

// Below `lg` the bottom nav's slot is where the toasts sit (--toast-bottom).
const PHONE = '(max-width: 63.999rem)'

/**
 * An error toast. It is shown while a sheet is usually open, and the sheet's
 * Save button sits where a bottom toast would land, so on a phone errors go
 * to the top, over the sheet's backdrop; from `lg` they stay at the bottom
 * with the other toasts.
 */
export function toastError(message: string) {
  const phone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(PHONE).matches
  return toast.error(message, phone ? { position: 'top-center' } : undefined)
}
