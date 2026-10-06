function isLocalPath(path: string) {
  return (
    path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
  )
}

/** A same-origin path to return to after sign-in, or "/". Blocks `//host` and `/\host`. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !isLocalPath(value)) return '/'
  const base = 'https://app.invalid'
  try {
    const url = new URL(value, base)
    if (url.origin !== base) return '/'
    // Normalizing can turn "/.//host" into "//host", so check the result too.
    const path = url.pathname + url.search + url.hash
    return isLocalPath(path) ? path : '/'
  } catch {
    return '/'
  }
}
