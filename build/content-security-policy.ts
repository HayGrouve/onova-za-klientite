/**
 * The Content-Security-Policy header (D108, D111). Clerk's Frontend API host
 * is read from the publishable key, so the production instance on the owner's
 * domain (D50) needs no hand edit of the policy.
 */

/** Used when there is no key to read (local tests, a build without env). */
const DEVELOPMENT_CLERK_HOST = '*.clerk.accounts.dev'

/**
 * A Clerk publishable key is `pk_test_` or `pk_live_` plus the base64 of
 * `<frontend-api-host>$`. Returns that host, or null for anything else. The
 * host goes into the policy, so only a plain dotted host name passes.
 */
export function clerkFrontendHost(publishableKey: string | undefined) {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/_-]+={0,2})$/.exec(
    publishableKey?.trim() ?? '',
  )
  if (!match) return null
  const decoded = Buffer.from(match[1], 'base64').toString('utf8')
  const host = decoded.endsWith('$') ? decoded.slice(0, -1) : null
  if (!host) return null
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) ? host : null
}

export function contentSecurityPolicy(publishableKey: string | undefined) {
  const clerk = `https://${clerkFrontendHost(publishableKey) ?? DEVELOPMENT_CLERK_HOST}`
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${clerk} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: https://img.clerk.com ${clerk} https://*.convex.cloud`,
    `connect-src 'self' data: blob: https://*.convex.cloud wss://*.convex.cloud ${clerk} https://clerk-telemetry.com`,
    `frame-src https://challenges.cloudflare.com ${clerk}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}
