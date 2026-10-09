/**
 * Where toasts sit. Below `lg` (the phone layout: a header on top, a bottom
 * nav) a toast takes the bottom nav's slot, and an error goes to the top,
 * clear of a bottom sheet's Save button (`toastError`).
 *
 * Sonner applies `mobileOffset` only at 600px and below and `offset` above, so
 * a top error toast between 601px and `lg` takes `offset.top`. It must clear
 * the header there as well; a bare 16 sat over the business switcher.
 */

/** The phone layout, which ends where the sidebar starts (`lg`). */
export const PHONE_QUERY = '(max-width: 63.999rem)'

const BOTTOM = 'var(--toast-bottom)'

/** Above 600px. The top is just under the header: 0.75rem padding, 2.75rem buttons, 0.5rem. */
export const TOAST_OFFSET = {
  bottom: BOTTOM,
  top: 'calc(4rem + env(safe-area-inset-top))',
}

/** Up to 600px, over the top edge, where the sheet's backdrop is. */
export const TOAST_MOBILE_OFFSET = {
  bottom: BOTTOM,
  top: 'calc(0.75rem + env(safe-area-inset-top))',
}
