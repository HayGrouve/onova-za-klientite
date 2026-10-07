import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { normalizePhone } from '../shared/phone'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import { mergeExtra } from './lib/extra'
import { clientSearchText, jobSearchText } from './lib/search'
import { optionalText, requiredText } from './lib/validate'
import { vChannel, vExtra } from './validators'

const vPhoneInput = v.object({
  number: v.string(),
  label: v.optional(v.string()),
})

const MAX_PHONES = 5

function normalizePhones(phones: Array<{ number: string; label?: string }>) {
  if (phones.length > MAX_PHONES) fail('invalid', { field: 'phones' })
  const seen = new Set<string>()
  const result: Doc<'clients'>['phones'] = []
  for (const phone of phones) {
    if (!phone.number.trim()) continue
    const e164 = normalizePhone(phone.number)
    if (!e164) fail('invalid', { field: 'phone' })
    if (seen.has(e164)) continue
    seen.add(e164)
    result.push({ e164, label: optionalText(phone.label, 'label', 40) })
  }
  return result
}

/** Keeps the phone lookup table (for duplicate warnings) in step with the client. */
async function syncPhones(
  ctx: BusinessMutationCtx,
  clientId: Id<'clients'>,
  phones: Doc<'clients'>['phones'],
) {
  const rows = await ctx.db
    .query('clientPhones')
    .withIndex('by_client', (q) => q.eq('clientId', clientId))
    .collect()
  const wanted = new Set(phones.map((phone) => phone.e164))
  for (const row of rows) {
    if (!wanted.has(row.e164)) await ctx.db.delete('clientPhones', row._id)
  }
  const have = new Set(rows.map((row) => row.e164))
  for (const phone of phones) {
    if (!have.has(phone.e164)) {
      await ctx.db.insert('clientPhones', {
        businessId: ctx.business._id,
        clientId,
        e164: phone.e164,
      })
    }
  }
}

const clientFields = {
  kind: v.optional(v.union(v.literal('person'), v.literal('company'))),
  phones: v.optional(v.array(vPhoneInput)),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  note: v.optional(v.string()),
  preferredChannel: v.optional(vChannel),
  extra: v.optional(vExtra),
}

export const create = businessMutation({
  args: { name: v.string(), ...clientFields },
  returns: v.id('clients'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = {
      businessId: ctx.business._id,
      kind: args.kind ?? 'person',
      name: requiredText(args.name, 'name', 120),
      isNoClient: false,
      phones: normalizePhones(args.phones ?? []),
      email: optionalText(args.email, 'email', 200),
      address: optionalText(args.address, 'address', 500),
      note: optionalText(args.note, 'note', 5000),
      preferredChannel: args.preferredChannel,
      consent: {},
      extra: await mergeExtra(ctx, ctx.business._id, 'client', args.extra),
      creditCents: 0,
    }
    const clientId = await ctx.db.insert('clients', {
      ...client,
      searchText: await clientSearchText(ctx, client),
    })
    await syncPhones(ctx, clientId, client.phones)
    await logActivity(ctx, {
      type: 'client.created',
      clientId,
      data: { name: client.name },
    })
    return clientId
  },
})

/** "No client" is built in: it is never renamed, given contacts, merged or anonymized. */
export const update = businessMutation({
  args: {
    clientId: v.id('clients'),
    name: v.optional(v.string()),
    ...clientFields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const client = await getOwned(ctx, 'clients', args.clientId)
    if (client.isNoClient) fail('client.noClient')
    const patch: Partial<Doc<'clients'>> = {}
    if (args.name !== undefined)
      patch.name = requiredText(args.name, 'name', 120)
    if (args.kind !== undefined) patch.kind = args.kind
    if (args.phones !== undefined) patch.phones = normalizePhones(args.phones)
    if (args.email !== undefined)
      patch.email = optionalText(args.email, 'email', 200)
    if (args.address !== undefined)
      patch.address = optionalText(args.address, 'address', 500)
    if (args.note !== undefined)
      patch.note = optionalText(args.note, 'note', 5000)
    if (args.preferredChannel !== undefined)
      patch.preferredChannel = args.preferredChannel
    if (args.extra !== undefined) {
      patch.extra = await mergeExtra(
        ctx,
        ctx.business._id,
        'client',
        args.extra,
        client.extra,
      )
    }
    const next = { ...client, ...patch }
    patch.searchText = await clientSearchText(ctx, next)
    await ctx.db.patch('clients', client._id, patch)
    if (patch.phones) await syncPhones(ctx, client._id, patch.phones)

    // Job search keys include the client's name.
    if (patch.name !== undefined && patch.name !== client.name) {
      const jobs = await ctx.db
        .query('jobs')
        .withIndex('by_client', (q) => q.eq('clientId', client._id))
        .collect()
      for (const job of jobs) {
        await ctx.db.patch('jobs', job._id, {
          searchText: await jobSearchText(ctx, job),
        })
      }
    }
    await logActivity(ctx, {
      type: 'client.edited',
      clientId: client._id,
      data: { from: client.name, to: next.name },
    })
    return null
  },
})
