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

/**
 * The absolute `redirect_url` to hand to sign-in: this app's origin plus a
 * safe path. Sign-in runs on another host (the hub's Vhod page or Clerk's
 * Account Portal), where a bare path would point at that host instead.
 */
export function signInReturnUrl(value: unknown, origin: string): string {
  return new URL(safeRedirect(value), origin).href
}
