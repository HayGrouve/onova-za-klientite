import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    /** Clerk's Frontend API URL, e.g. https://….clerk.accounts.dev (ADR 0003). */
    CLERK_JWT_ISSUER_DOMAIN: v.string(),
    /** "true" on dev and preview deployments only. Never set on production. */
    ALLOW_SEED: v.optional(v.literal('true')),
  },
})

export default app
