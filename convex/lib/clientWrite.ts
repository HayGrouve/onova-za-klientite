import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { normalizePhone } from '../../shared/phone'
import { vChannel, vExtra } from '../validators'
import { logActivity } from './activity'
import type { BusinessMutationCtx } from './auth'
import { fail } from './errors'
import { mergeExtra } from './extra'
import { clientSearchText } from './search'
import { optionalText, requiredText } from './validate'

export const vPhoneInput = v.object({
  number: v.string(),
  label: v.optional(v.string()),
})

const MAX_PHONES = 5

export function normalizePhones(
  phones: Array<{ number: string; label?: string }>,
) {
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
export async function syncPhones(
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

export const clientFields = {
  kind: v.optional(v.union(v.literal('person'), v.literal('company'))),
  phones: v.optional(v.array(vPhoneInput)),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  note: v.optional(v.string()),
  preferredChannel: v.optional(vChannel),
  extra: v.optional(vExtra),
}

export const vCreateClientArgs = v.object({ name: v.string(), ...clientFields })

export type CreateClientArgs = Infer<typeof vCreateClientArgs>

/** Creates a client with normalized phones and search keys, and logs it. Callers check roles. */
export async function createClient(
  ctx: BusinessMutationCtx,
  args: CreateClientArgs,
) {
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
}
