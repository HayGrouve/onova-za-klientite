function clean(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  return trimmed || undefined
}

export const convexUrl = clean(
  import.meta.env.VITE_CONVEX_URL as string | undefined,
)

export const clerkPublishableKey = clean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined,
)

/** The public VAPID key for Web Push (ADR 0011). Not a secret. */
export const vapidPublicKey = clean(
  import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
)

const akauntUrlFromEnv = clean(
  import.meta.env.VITE_AKAUNT_URL as string | undefined,
)

/**
 * Where the person manages their Akaunt (the shared sign-in): the hub's
 * `https://onovaza.com/akaunt` in production (`VITE_AKAUNT_URL`). Unset (dev,
 * previews), Clerk's Account Portal for the instance the app signs in with
 * (ADR 0012).
 */
export function akauntUrl(clerk: { buildUserProfileUrl: () => string }) {
  return akauntUrlFromEnv ?? clerk.buildUserProfileUrl()
}
