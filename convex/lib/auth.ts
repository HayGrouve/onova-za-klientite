import { hasRole } from '../../shared/roles'
import { v } from 'convex/values'
import {
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions'
import { mutation, query } from '../_generated/server'
import type { Doc, Id, TableNames } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { fail } from './errors'

type Role = Doc<'memberships'>['role']

export async function findCurrentUser(
  ctx: QueryCtx,
): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return await ctx.db
    .query('users')
    .withIndex('by_token', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique()
}

async function requireUser(ctx: QueryCtx): Promise<Doc<'users'>> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) fail('auth.signedOut')
  const user = await findCurrentUser(ctx)
  if (!user) fail('auth.noUser')
  return user
}

/** The caller's active membership in a business, or null. */
export async function findMembership(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  userId: Id<'users'>,
): Promise<Doc<'memberships'> | null> {
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_business_user', (q) =>
      q.eq('businessId', businessId).eq('userId', userId),
    )
    .unique()
  if (!membership || membership.deactivatedAt !== undefined) return null
  return membership
}

async function loadBusinessScope(ctx: QueryCtx, businessId: Id<'businesses'>) {
  const user = await requireUser(ctx)
  const member = await findMembership(ctx, businessId, user._id)
  if (!member) fail('auth.notMember')
  const business = await ctx.db.get('businesses', businessId)
  if (!business) fail('auth.notMember')
  return { user, member, business }
}

/** A signed-in user with a `users` row. For functions outside any business. */
export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
)

export const userMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
)

/**
 * Every business-scoped public function goes through these (ADR 0006). The
 * caller passes `businessId`; the wrapper proves an active membership and
 * passes `ctx.business`, `ctx.member` and `ctx.user` on.
 */
export const businessQuery = customQuery(query, {
  args: { businessId: v.id('businesses') },
  input: async (ctx, { businessId }) => ({
    ctx: await loadBusinessScope(ctx, businessId),
    args: {},
  }),
})

export const businessMutation = customMutation(mutation, {
  args: { businessId: v.id('businesses') },
  input: async (ctx, { businessId }) => ({
    ctx: await loadBusinessScope(ctx, businessId),
    args: {},
  }),
})

/** Throws unless the member's role is at least `role`. */
export function requireRole(member: Doc<'memberships'>, role: Role) {
  if (!hasRole(member.role, role)) fail('auth.forbidden')
}

type BusinessScoped = TableNames extends infer T
  ? T extends TableNames
    ? Doc<T> extends { businessId: Id<'businesses'> }
      ? T
      : never
    : never
  : never

/** Loads a document by id and checks it belongs to the caller's business. */
export async function getOwned<T extends BusinessScoped>(
  ctx: QueryCtx & { business: Doc<'businesses'> },
  table: T,
  id: Id<T>,
): Promise<Doc<T>> {
  const doc = await ctx.db.get(table, id)
  const owner = (doc as { businessId?: Id<'businesses'> } | null)?.businessId
  if (!doc || owner !== ctx.business._id) {
    fail('notFound', { table })
  }
  return doc
}

/**
 * `getOwned` for a client a write is aimed at. A tab that was left open can
 * still hold the id of a client that was merged into another or anonymized
 * since: writing to it would put new records on a dead client. Merge's `from`
 * and anonymize itself use `getOwned`, as they work on such a client.
 */
export async function getLiveClient(
  ctx: QueryCtx & { business: Doc<'businesses'> },
  clientId: Id<'clients'>,
): Promise<Doc<'clients'>> {
  const client = await getOwned(ctx, 'clients', clientId)
  if (client.mergedIntoId !== undefined) fail('client.merged')
  if (client.anonymizedAt !== undefined) fail('client.anonymized')
  return client
}

/**
 * `getOwned` for an id that came from the address bar, where any text can
 * arrive: text that is no id, or the id of another table, is `notFound` too
 * (D16), instead of an argument error the client could not tell apart.
 */
export async function getOwnedFromUrl<T extends BusinessScoped>(
  ctx: QueryCtx & { business: Doc<'businesses'> },
  table: T,
  id: string,
): Promise<Doc<T>> {
  const normalized = ctx.db.normalizeId(table, id)
  if (!normalized) fail('notFound', { table })
  return await getOwned(ctx, table, normalized)
}

export type BusinessMutationCtx = MutationCtx & {
  user: Doc<'users'>
  member: Doc<'memberships'>
  business: Doc<'businesses'>
}
