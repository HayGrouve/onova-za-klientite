/** A same-origin path to return to after sign-in, or "/". Blocks `//host` and `/\host`. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  const base = 'https://app.invalid'
  try {
    const url = new URL(value, base)
    if (url.origin !== base) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}
