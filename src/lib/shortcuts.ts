// Keyboard shortcuts for a desktop: when a key press counts, and where it
// must stay out of the way.

/**
 * Whether a key press is the shortcut for `letter`: a plain press, or with
 * Ctrl or Cmd when `withCtrl`. The key is matched by its place on the
 * keyboard too, because the Bulgarian layout types a Cyrillic letter where
 * the Latin one is. A held key and a press something else already handled
 * don't count.
 */
export function isShortcut(
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'code'
    | 'ctrlKey'
    | 'metaKey'
    | 'altKey'
    | 'repeat'
    | 'defaultPrevented'
  >,
  letter: string,
  withCtrl = false,
): boolean {
  if (event.repeat || event.defaultPrevented || event.altKey) return false
  const mod = event.ctrlKey || event.metaKey
  if (mod !== withCtrl) return false
  return (
    event.code === `Key${letter.toUpperCase()}` ||
    event.key.toLowerCase() === letter
  )
}

// A one-letter shortcut must never fire while someone types, or from inside
// an open dialog or menu.
const BLOCKING =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/** True where a one-letter shortcut must stay out of the way. */
export function shortcutBlockedAt(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(BLOCKING) !== null
}
