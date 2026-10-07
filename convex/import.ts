import { v } from 'convex/values'
import { IMPORT_BATCH } from '../shared/import'
import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { createClient, normalizePhones } from './lib/clientWrite'
import { businessMutation, businessQuery, requireRole } from './lib/auth'
import { fail } from './lib/errors'
import { vExtra } from './validators'

const MAX_LOOKUP = 500

async function anyPhoneExists(
  ctx: QueryCtx & { business: Doc<'businesses'> },
  phones: Array<{ e164: string }>,
) {
  for (const phone of phones) {
    if (await phoneExists(ctx, phone.e164)) return true
  }
  return false
}

const vImportRow = v.object({
  name: v.string(),
  kind: v.optional(v.union(v.literal('person'), v.literal('company'))),
  phones: v.array(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  note: v.optional(v.string()),
  extra: vExtra,
})

/**
 * Creates up to 100 clients from an import file or the phone's contacts, as
 * if added one by one. With `skipDuplicates`, a row whose phone is already a
 * client's (or was added earlier in this call) is skipped. The screen sends
 * a big file in several calls and adds the counts up.
 */
export const clients = businessMutation({
  args: { rows: v.array(vImportRow), skipDuplicates: v.boolean() },
  returns: v.object({ created: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    if (args.rows.length > IMPORT_BATCH) fail('invalid', { field: 'rows' })
    let created = 0
    let skipped = 0
    for (const row of args.rows) {
      const phones = normalizePhones(row.phones.map((number) => ({ number })))
      if (args.skipDuplicates && (await anyPhoneExists(ctx, phones))) {
        skipped++
        continue
      }
      await createClient(ctx, {
        name: row.name,
        kind: row.kind,
        phones: phones.map((phone) => ({ number: phone.e164 })),
        email: row.email,
        address: row.address,
        note: row.note,
        extra: row.extra,
      })
      created++
    }
    return { created, skipped }
  },
})

async function phoneExists(
  ctx: QueryCtx & { business: Doc<'businesses'> },
  e164: string,
) {
  const row = await ctx.db
    .query('clientPhones')
    .withIndex('by_business_e164', (q) =>
      q.eq('businessId', ctx.business._id).eq('e164', e164),
    )
    .first()
  return row !== null
}

/** Which of these numbers (E.164, at most 500) already belong to a client. */
export const duplicatesByPhone = businessQuery({
  args: { phones: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    if (args.phones.length > MAX_LOOKUP) fail('invalid', { field: 'phones' })
    const found: string[] = []
    for (const phone of new Set(args.phones)) {
      if (await phoneExists(ctx, phone)) found.push(phone)
    }
    return found
  },
})
