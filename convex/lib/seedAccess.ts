import { env } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

/**
 * On dev and preview deployments (`ALLOW_SEED=true`), everyone who signs in
 * also joins the seeded test businesses, so a fresh Clerk test user sees
 * both. Production never has the variable.
 */
export function seedAllowed() {
  return env.ALLOW_SEED === 'true'
}

export async function joinSeedBusinesses(
  ctx: MutationCtx,
  userId: Id<'users'>,
) {
  if (!seedAllowed()) return
  const seeded = await ctx.db
    .query('businesses')
    .withIndex('by_seed_key', (q) => q.gt('seedKey', ''))
    .collect()
  for (const business of seeded) {
    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_business_user', (q) =>
        q.eq('businessId', business._id).eq('userId', userId),
      )
      .unique()
    if (existing) continue
    await ctx.db.insert('memberships', {
      businessId: business._id,
      userId,
      role: 'owner',
      notify: { morningSummary: false, remindersDue: false, overdue: false },
    })
  }
}
