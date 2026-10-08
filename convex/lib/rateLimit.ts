import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'
import { fail } from './errors'

const DAY = 24 * HOUR

/**
 * Limits on the few calls a signed-in person could use to fill storage or the
 * database (D12). Each is keyed in the call: by member, user or business.
 */
const limits = new RateLimiter(components.rateLimiter, {
  /** Upload URLs: a steady 60 an hour, 20 at once for a batch of photos. */
  uploadUrl: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 20 },
  /** New push subscriptions (a device's first, or a changed one). */
  pushSubscribe: { kind: 'fixed window', rate: 10, period: HOUR },
  /** Extra businesses (Q13). */
  createBusiness: { kind: 'fixed window', rate: 5, period: DAY },
  /** Import batches of 100 rows: up to 10 000 rows at once, then 3 000 a minute. */
  importBatch: {
    kind: 'token bucket',
    rate: 30,
    period: MINUTE,
    capacity: 100,
  },
})

type LimitName =
  'uploadUrl' | 'pushSubscribe' | 'createBusiness' | 'importBatch'

/** Spends one use of a limit, or fails with `rate.limited`. */
export async function spend(ctx: MutationCtx, name: LimitName, key: string) {
  const status = await limits.limit(ctx, name, { key })
  if (!status.ok) fail('rate.limited', { retryAfterMs: status.retryAfter })
}
