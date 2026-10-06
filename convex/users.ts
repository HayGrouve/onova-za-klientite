import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { findCurrentUser, findMembership, userMutation } from './lib/auth'
import { createBusiness } from './lib/createBusiness'
import { fail } from './lib/errors'
import { joinSeedBusinesses } from './lib/seedAccess'
import { vModules, vRole, vWords } from './validators'

function displayName(identity: { name?: string; email?: string }) {
  return identity.name?.trim() || identity.email?.split('@')[0] || ''
}

/**
 * Called by the app after every sign-in. Creates the user on first sign-in,
 * with their own business, and keeps the profile in step with Clerk.
 */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) fail('auth.signedOut')

    const profile = {
      name: displayName(identity),
      email: identity.email,
      imageUrl: identity.pictureUrl,
    }

    const existing = await findCurrentUser(ctx)
    if (existing) {
      if (
        existing.name !== profile.name ||
        existing.email !== profile.email ||
        existing.imageUrl !== profile.imageUrl
      ) {
        await ctx.db.patch('users', existing._id, profile)
      }
      return existing._id
    }

    const userId = await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      ...profile,
    })
    const businessId = await createBusiness(ctx, userId)
    await ctx.db.patch('users', userId, { activeBusinessId: businessId })
    await joinSeedBusinesses(ctx, userId)
    return userId
  },
})

async function activeMemberships(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<Doc<'memberships'>[]> {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  return memberships.filter(
    (membership) => membership.deactivatedAt === undefined,
  )
}

const vViewer = v.union(
  v.null(),
  v.object({
    user: v.object({
      name: v.string(),
      email: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
    }),
    businesses: v.array(
      v.object({ _id: v.id('businesses'), name: v.string(), role: vRole }),
    ),
    business: v.union(
      v.null(),
      v.object({
        _id: v.id('businesses'),
        name: v.string(),
        words: vWords,
        modules: vModules,
        setupDone: v.boolean(),
      }),
    ),
  }),
)

/** Everything the signed-in shell needs: who, which businesses, and the active one's words. */
export const viewer = query({
  args: {},
  returns: vViewer,
  handler: async (ctx) => {
    const user = await findCurrentUser(ctx)
    if (!user) return null

    const memberships = await activeMemberships(ctx, user._id)
    const loaded: Array<{
      business: Doc<'businesses'>
      role: Doc<'memberships'>['role']
    }> = []
    for (const membership of memberships) {
      const business = await ctx.db.get('businesses', membership.businessId)
      if (business) loaded.push({ business, role: membership.role })
    }
    loaded.sort((a, b) => a.business.name.localeCompare(b.business.name, 'bg'))

    const active =
      loaded.find(({ business }) => business._id === user.activeBusinessId)
        ?.business ?? loaded.at(0)?.business

    return {
      user: { name: user.name, email: user.email, imageUrl: user.imageUrl },
      businesses: loaded.map(({ business, role }) => ({
        _id: business._id,
        name: business.name,
        role,
      })),
      business: active
        ? {
            _id: active._id,
            name: active.name,
            words: active.words,
            modules: active.modules,
            setupDone: active.setup.completedAt !== undefined,
          }
        : null,
    }
  },
})

export const setActiveBusiness = userMutation({
  args: { businessId: v.id('businesses') },
  returns: v.null(),
  handler: async (ctx, { businessId }) => {
    const membership = await findMembership(ctx, businessId, ctx.user._id)
    if (!membership) fail('auth.notMember')
    await ctx.db.patch('users', ctx.user._id, { activeBusinessId: businessId })
    return null
  },
})
