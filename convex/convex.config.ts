import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import workpool from '@convex-dev/workpool/convex.config.js'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    /** Clerk's Frontend API URL, e.g. https://….clerk.accounts.dev (ADR 0012). */
    CLERK_JWT_ISSUER_DOMAIN: v.string(),
    /**
     * Comma separated origins a token's `azp` must match, e.g.
     * https://klientite.onovaza.com. Production only, set last at the cutover;
     * unset on dev and previews, where `azp` isn't checked (ADR 0012).
     */
    CLERK_AUTHORIZED_PARTIES: v.optional(v.string()),
    /** "true" on dev and preview deployments only. Never set on production. */
    ALLOW_SEED: v.optional(v.literal('true')),
    /** Clerk Backend API key, to delete the Clerk user with the account. */
    CLERK_SECRET_KEY: v.optional(v.string()),
    /** Web Push (ADR 0011). Optional, so a deployment without keys still runs. */
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    /** A `mailto:` address: Apple rejects anything else. */
    VAPID_SUBJECT: v.optional(v.string()),
    /** The app's https origin. Push links are absolute with it (ADR 0011). */
    APP_URL: v.optional(v.string()),
  },
})

// Push fan-out with retries (D12).
app.use(workpool, { name: 'pushPool' })

// Limits on uploads, push subscriptions, extra businesses and imports (D12).
app.use(rateLimiter)

export default app
