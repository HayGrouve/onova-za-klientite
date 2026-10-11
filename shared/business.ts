const fold = (text: string) =>
  text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('bg')

/**
 * Whether a typed name is the business's own, as deleting a business asks for
 * it (D124). Case and spacing don't count; anything else does, so a slip of
 * the hand or a half-typed name never deletes.
 */
export function namesMatch(typed: string, name: string): boolean {
  const folded = fold(typed)
  return folded !== '' && folded === fold(name)
}
