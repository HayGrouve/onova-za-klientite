import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { buildSearchText } from '../shared/search'
import { createBusiness } from './lib/createBusiness'
import { fail } from './lib/errors'
import { joinSeedBusinesses, seedAllowed } from './lib/seedAccess'
import { SEED_BUSINESSES } from './seedData'
import type { SeedBusiness } from './seedData'

/** Removes a business's records but keeps the business, its owner memberships and "No client". */
async function clearBusinessData(
  ctx: MutationCtx,
  business: Doc<'businesses'>,
) {
  const businessId = business._id
  const remove = async <T extends TableNames>(
    table: T,
    docs: Array<Doc<T>>,
  ) => {
    for (const doc of docs) await ctx.db.delete(table, doc._id)
  }
  const byBusiness = (q: {
    eq: (field: 'businessId', value: Id<'businesses'>) => any
  }) => q.eq('businessId', businessId)
  await remove(
    'stages',
    await ctx.db
      .query('stages')
      .withIndex('by_business_order', byBusiness)
      .collect(),
  )
  await remove(
    'services',
    await ctx.db
      .query('services')
      .withIndex('by_business_order', byBusiness)
      .collect(),
  )
  await remove(
    'fields',
    await ctx.db
      .query('fields')
      .withIndex('by_business_target_order', byBusiness)
      .collect(),
  )
  await remove(
    'items',
    await ctx.db.query('items').withIndex('by_business', byBusiness).collect(),
  )
  await remove(
    'clientPhones',
    await ctx.db
      .query('clientPhones')
      .withIndex('by_business_e164', byBusiness)
      .collect(),
  )
  const clients = await ctx.db
    .query('clients')
    .withIndex('by_business_name', byBusiness)
    .collect()
  await remove(
    'clients',
    clients.filter((client) => !client.isNoClient),
  )
}

async function seedBusiness(
  ctx: MutationCtx,
  seed: SeedBusiness,
  ownerId: Id<'users'> | null,
) {
  let business = await ctx.db
    .query('businesses')
    .withIndex('by_seed_key', (q) => q.eq('seedKey', seed.key))
    .unique()

  if (!business) {
    // The business needs an owner to be created; seed users join right after.
    const placeholderOwner =
      ownerId ??
      (await ctx.db.insert('users', {
        tokenIdentifier: `seed|${seed.key}`,
        clerkUserId: `seed_${seed.key}`,
        name: seed.settings.name,
      }))
    const id = await createBusiness(ctx, placeholderOwner, {
      seedKey: seed.key,
    })
    business = (await ctx.db.get('businesses', id))!
  }

  await clearBusinessData(ctx, business)
  const { name, words, modules, jobFlow, depositsOnNewJob, reminderRule } =
    seed.settings
  await ctx.db.patch('businesses', business._id, {
    name,
    words,
    modules,
    jobFlow,
    depositsOnNewJob,
    reminderRule,
    setup: { completedAt: Date.now() },
  })

  const businessId = business._id
  for (const [order, stage] of seed.stages.entries()) {
    await ctx.db.insert('stages', {
      businessId,
      ...stage,
      order,
      visibleToClient: false,
    })
  }
  for (const [order, service] of seed.services.entries()) {
    await ctx.db.insert('services', { businessId, ...service, order })
  }
  const fieldIds: Record<string, Id<'fields'>> = {}
  for (const [order, field] of seed.itemFields.entries()) {
    fieldIds[field.name] = await ctx.db.insert('fields', {
      businessId,
      target: 'item',
      ...field,
      order,
      visibleToClient: false,
    })
  }

  for (const client of seed.clients) {
    const phones = (client.phones ?? []).map((e164) => ({ e164 }))
    const clientId = await ctx.db.insert('clients', {
      businessId,
      kind: client.kind ?? 'person',
      name: client.name,
      isNoClient: false,
      phones,
      email: client.email,
      address: client.address,
      note: client.note,
      consent: {},
      extra: {},
      creditCents: 0,
      searchText: buildSearchText([
        client.name,
        client.email,
        ...(client.phones ?? []),
      ]),
    })
    for (const phone of phones) {
      await ctx.db.insert('clientPhones', {
        businessId,
        clientId,
        e164: phone.e164,
      })
    }
    for (const item of client.items ?? []) {
      const extra: Record<string, string> = {}
      for (const [fieldName, value] of Object.entries(item.extra)) {
        const fieldId = fieldIds[fieldName] as Id<'fields'> | undefined
        if (!fieldId)
          throw new Error(`Seed item field "${fieldName}" is not defined`)
        extra[fieldId] = value
      }
      await ctx.db.insert('items', {
        businessId,
        clientId,
        name: item.name,
        extra,
        searchText: buildSearchText([item.name, ...Object.values(item.extra)]),
      })
    }
  }
  return businessId
}

async function runSeed(ctx: MutationCtx) {
  if (!seedAllowed()) fail('seed.notAllowed')
  const users = await ctx.db.query('users').collect()
  const realUsers = users.filter(
    (user) => !user.tokenIdentifier.startsWith('seed|'),
  )
  const businessIds = []
  for (const seed of SEED_BUSINESSES) {
    businessIds.push(
      await seedBusiness(ctx, seed, realUsers.at(0)?._id ?? null),
    )
  }
  for (const user of realUsers) await joinSeedBusinesses(ctx, user._id)
  return { businessIds, users: realUsers.length }
}

/**
 * `npx convex run seed:dev`: Мебели Стоянов and Хладина Сервиз, joined by
 * every user on the deployment. Running it again rebuilds the same data.
 * Refuses unless the deployment has `ALLOW_SEED=true`.
 */
export const dev = internalMutation({
  args: {},
  returns: v.object({
    businessIds: v.array(v.id('businesses')),
    users: v.number(),
  }),
  handler: runSeed,
})

/** Run by the Vercel preview build (ADR 0004). Same data as `dev`. */
export const preview = internalMutation({
  args: {},
  returns: v.object({
    businessIds: v.array(v.id('businesses')),
    users: v.number(),
  }),
  handler: runSeed,
})
