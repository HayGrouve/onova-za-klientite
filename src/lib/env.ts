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
