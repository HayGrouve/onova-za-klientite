import { toast } from 'sonner'
import { PHONE_QUERY } from './toast-layout'

/**
 * An error toast. It is shown while a sheet is usually open, and the sheet's
 * Save button sits where a bottom toast would land, so below `lg` errors go
 * to the top (under the header from 601px, see toast-layout.ts); from `lg`
 * they stay at the bottom with the other toasts.
 */
export function toastError(message: string) {
  const phone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(PHONE_QUERY).matches
  return toast.error(message, phone ? { position: 'top-center' } : undefined)
}
