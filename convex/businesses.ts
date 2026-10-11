import { v } from 'convex/values'
import { namesMatch } from '../shared/business'
import { isValidWord } from '../shared/words'
import { scheduleDeletion } from './account'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  requireRole,
  userMutation,
} from './lib/auth'
import { createBusiness } from './lib/createBusiness'
import { fail } from './lib/errors'
import { readJobCounts } from './lib/jobCounts'
import { spend } from './lib/rateLimit'
import { optionalText, requiredText } from './lib/validate'
import { vModules, vWords } from './validators'

/** Everything Settings shows about the business itself. */
export const settings = businessQuery({
  args: {},
  handler: async (ctx) => {
    const business = ctx.business
    const logo = business.logoFileId
      ? await ctx.db.get('files', business.logoFileId)
      : null
    const stages = await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) => q.eq('businessId', business._id))
      .collect()
    const services = await ctx.db
      .query('services')
      .withIndex('by_business_order', (q) => q.eq('businessId', business._id))
      .collect()
    return {
      name: business.name,
      phone: business.phone,
      email: business.email,
      address: business.address,
      logoUrl: logo ? await ctx.storage.getUrl(logo.storageId) : null,
      words: business.words,
      modules: business.modules,
      jobFlow: business.jobFlow,
      depositsOnNewJob: business.depositsOnNewJob,
      reminderRule: business.reminderRule ?? null,
      stages: stages.map(({ _id, name, color, group, order }) => ({
        _id,
        name,
        color,
        group,
        order,
      })),
      services: services.map(({ _id, name, priceCents, archivedAt }) => ({
        _id,
        name,
        priceCents,
        archived: archivedAt !== undefined,
      })),
      storageBytes: business.storageBytes,
      role: ctx.member.role,
    }
  },
})

/**
 * How many jobs each stage holds, for the Stages screen only: Settings itself
 * stays small, and a job change doesn't re-run every other Settings screen.
 * Not for a Worker, who sees only their own jobs (D89).
 */
export const stageJobCounts = businessQuery({
  args: {},
  returns: v.array(v.object({ stageId: v.id('stages'), jobCount: v.number() })),
  handler: async (ctx) => {
    requireRole(ctx.member, 'manager')
    const stages = await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) =>
        q.eq('businessId', ctx.business._id),
      )
      .collect()
    // Exact, from the counts the ledger keeps (D105); no job is read.
    const { stages: held } = await readJobCounts(ctx, ctx.business._id)
    const counts = stages.map((stage) => ({
      stageId: stage._id,
      jobCount: held[stage._id] ?? 0,
    }))
    return counts
  },
})

export const updateProfile = businessMutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    await ctx.db.patch('businesses', ctx.business._id, {
      name: requiredText(args.name, 'name', 120),
      phone: optionalText(args.phone, 'phone', 40),
      email: optionalText(args.email, 'email', 200),
      address: optionalText(args.address, 'address', 500),
    })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'profile' },
    })
    return null
  },
})

/** Names: the business's own words, singular, plural and gender (Q10). */
export const setWords = businessMutation({
  args: { words: vWords },
  returns: v.null(),
  handler: async (ctx, { words }) => {
    requireRole(ctx.member, 'owner')
    const clean = Object.fromEntries(
      Object.entries(words).map(([key, word]) => {
        if (!isValidWord(word)) fail('invalid', { field: key })
        return [
          key,
          {
            singular: word.singular.trim(),
            plural: word.plural.trim(),
            gender: word.gender,
          },
        ]
      }),
    ) as typeof words
    await ctx.db.patch('businesses', ctx.business._id, { words: clean })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'words' },
    })
    return null
  },
})

/** Switching a module off hides it and its data, never deletes them. */
export const setModules = businessMutation({
  args: { modules: vModules },
  returns: v.null(),
  handler: async (ctx, { modules }) => {
    requireRole(ctx.member, 'owner')
    await ctx.db.patch('businesses', ctx.business._id, { modules })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'modules' },
    })
    return null
  },
})

/** The single automation: suggest a reminder N months after a job is done. Null turns it off. */
export const setReminderRule = businessMutation({
  args: { months: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { months }) => {
    requireRole(ctx.member, 'owner')
    if (
      months !== null &&
      (!Number.isInteger(months) || months < 1 || months > 60)
    ) {
      fail('invalid', { field: 'months' })
    }
    await ctx.db.patch('businesses', ctx.business._id, {
      reminderRule: months === null ? undefined : { months },
    })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'reminderRule' },
    })
    return null
  },
})

export const setNewJobOptions = businessMutation({
  args: { depositsOnNewJob: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    await ctx.db.patch('businesses', ctx.business._id, {
      depositsOnNewJob: args.depositsOnNewJob,
    })
    await logActivity(ctx, {
      type: 'settings.changed',
      data: { name: 'newJob' },
    })
    return null
  },
})

/** Q13: a second business. It starts with defaults and opens setup. */
export const createAnother = userMutation({
  args: {},
  returns: v.id('businesses'),
  handler: async (ctx) => {
    await spend(ctx, 'createBusiness', ctx.user._id)
    const businessId = await createBusiness(ctx, ctx.user._id)
    await ctx.db.patch('users', ctx.user._id, { activeBusinessId: businessId })
    return businessId
  },
})

/**
 * Deletes the business and everything in it, for good (D124). Only its Owner
 * may, and only by typing its name: the client asks for it before the button
 * works, and it is checked here too. Every member loses it at once; the data
 * goes in batches after. The caller moves to their next business, or to a new
 * one with setup when this was their only one. Returns where they are now.
 */
export const remove = businessMutation({
  args: { confirmName: v.string() },
  returns: v.id('businesses'),
  handler: async (ctx, { confirmName }) => {
    requireRole(ctx.member, 'owner')
    if (!namesMatch(confirmName, ctx.business.name)) {
      fail('invalid', { field: 'confirmName' })
    }
    const businessId = ctx.business._id
    // A team is a few people, so its memberships go in this one mutation.
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_business_user', (q) => q.eq('businessId', businessId))
      .collect()
    for (const membership of memberships) {
      await ctx.db.delete('memberships', membership._id)
      const user = await ctx.db.get('users', membership.userId)
      if (!user) continue
      const active = user.activeBusinessId
      if (active !== undefined && active !== businessId) continue
      // Nobody is left without a business: the last one gives way to a new one.
      await ctx.db.patch('users', user._id, {
        activeBusinessId:
          (await firstBusinessOf(ctx, user._id)) ??
          (await createBusiness(ctx, user._id)),
      })
    }
    await scheduleDeletion(ctx, [businessId])
    return (await ctx.db.get('users', ctx.user._id))!.activeBusinessId!
  },
})

/** One of the user's businesses they are still an active member of, if any. */
async function firstBusinessOf(ctx: QueryCtx, userId: Id<'users'>) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  return memberships.find((item) => item.deactivatedAt === undefined)
    ?.businessId
}
