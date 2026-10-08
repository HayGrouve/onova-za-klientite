import { v } from 'convex/values'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { ANONYMOUS_CLIENT_NAME } from '../shared/clients'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getLiveClient,
  getOwned,
  requireRole,
} from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import { moveClientMoney } from './lib/ledger'
import { clientSearchText, jobSearchText } from './lib/search'

/** Clients that already have one of these phones: the duplicate warning. */
export const findByPhones = businessQuery({
  args: {
    phones: v.array(v.string()),
    exceptClientId: v.optional(v.id('clients')),
  },
  returns: v.array(
    v.object({ _id: v.id('clients'), name: v.string(), phone: v.string() }),
  ),
  handler: async (ctx, { phones, exceptClientId }) => {
    // Only a Manager saves a client, and this names other clients (D89).
    requireRole(ctx.member, 'manager')
    const found = new Map<
      string,
      { _id: Id<'clients'>; name: string; phone: string }
    >()
    for (const e164 of phones.slice(0, 10)) {
      const rows = await ctx.db
        .query('clientPhones')
        .withIndex('by_business_e164', (q) =>
          q.eq('businessId', ctx.business._id).eq('e164', e164),
        )
        .take(5)
      for (const row of rows) {
        if (row.clientId === exceptClientId || found.has(row.clientId)) continue
        const client = await ctx.db.get('clients', row.clientId)
        if (client && client.mergedIntoId === undefined) {
          found.set(client._id, {
            _id: client._id,
            name: client.name,
            phone: e164,
          })
        }
      }
    }
    return [...found.values()]
  },
})

async function moveRows<T extends TableNames>(
  ctx: BusinessMutationCtx,
  table: T,
  rows: Array<Doc<T>>,
  intoId: Id<'clients'>,
) {
  for (const row of rows) {
    await ctx.db.patch(table, row._id, { clientId: intoId } as never)
  }
}

/**
 * Merges a duplicate into another client (design doc, "Иван exists twice").
 * Jobs, payments, items, reminders, appointments, files and messages move;
 * credit is recomputed. The merged record stays, marked, for the history.
 */
export const merge = businessMutation({
  args: { fromId: v.id('clients'), intoId: v.id('clients') },
  returns: v.null(),
  handler: async (ctx, { fromId, intoId }) => {
    requireRole(ctx.member, 'manager')
    if (fromId === intoId) fail('invalid', { field: 'intoId' })
    const from = await getOwned(ctx, 'clients', fromId)
    const into = await getLiveClient(ctx, intoId)
    if (from.isNoClient || into.isNoClient) fail('client.noClient')
    if (from.mergedIntoId || into.mergedIntoId) fail('client.merged')

    const byClient = <
      T extends
        | 'jobs'
        | 'payments'
        | 'allocations'
        | 'items'
        | 'reminders'
        | 'appointments'
        | 'files'
        | 'messages'
        | 'clientPhones',
    >(
      table: T,
    ) =>
      ctx.db
        .query(table)
        .withIndex('by_client' as never, (q: any) => q.eq('clientId', fromId))
        .collect() as Promise<Array<Doc<T>>>

    const jobs = await byClient('jobs')
    await moveRows(ctx, 'jobs', jobs, intoId)
    await moveClientMoney(ctx, fromId, intoId)
    for (const table of [
      'items',
      'reminders',
      'appointments',
      'files',
      'messages',
    ] as const) {
      await moveRows(ctx, table, await byClient(table), intoId)
    }

    // Phones join the surviving client; contact details fill only its gaps.
    const phones = [...into.phones]
    for (const phone of from.phones) {
      if (!phones.some((item) => item.e164 === phone.e164)) phones.push(phone)
    }
    for (const row of await byClient('clientPhones')) {
      if (into.phones.some((item) => item.e164 === row.e164))
        await ctx.db.delete('clientPhones', row._id)
      else await ctx.db.patch('clientPhones', row._id, { clientId: intoId })
    }
    const merged = {
      phones,
      email: into.email ?? from.email,
      address: into.address ?? from.address,
      note: [into.note, from.note].filter(Boolean).join('\n') || undefined,
      extra: { ...from.extra, ...into.extra },
    }
    await ctx.db.patch('clients', intoId, {
      ...merged,
      searchText: await clientSearchText(ctx, { ...into, ...merged }),
    })
    await ctx.db.patch('clients', fromId, { mergedIntoId: intoId, phones: [] })

    for (const job of jobs) {
      const moved = (await ctx.db.get('jobs', job._id))!
      await ctx.db.patch('jobs', job._id, {
        searchText: await jobSearchText(ctx, moved),
      })
    }
    await logActivity(ctx, {
      type: 'client.merged',
      clientId: intoId,
      data: { from: from.name, fromId, toId: intoId },
    })
    return null
  },
})

/**
 * Anonymize on request (GDPR, Q11): name, contacts, extra fields, consent,
 * the messages log and the client's own files go. Jobs, money, items and
 * job files stay. It can't be undone, and the log keeps no old values.
 */
export const anonymize = businessMutation({
  args: { clientId: v.id('clients') },
  returns: v.null(),
  handler: async (ctx, { clientId }) => {
    requireRole(ctx.member, 'manager')
    const client = await getOwned(ctx, 'clients', clientId)
    if (client.isNoClient) fail('client.noClient')
    if (client.anonymizedAt !== undefined) return null

    for (const row of await ctx.db
      .query('clientPhones')
      .withIndex('by_client', (q) => q.eq('clientId', clientId))
      .collect()) {
      await ctx.db.delete('clientPhones', row._id)
    }
    for (const message of await ctx.db
      .query('messages')
      .withIndex('by_client', (q) => q.eq('clientId', clientId))
      .collect()) {
      await ctx.db.delete('messages', message._id)
    }
    let freed = 0
    for (const file of await ctx.db
      .query('files')
      .withIndex('by_client', (q) => q.eq('clientId', clientId))
      .collect()) {
      // Files of the client's jobs and items stay: only the client's own go.
      if (file.jobId || file.itemId) continue
      await ctx.storage.delete(file.storageId)
      await ctx.db.delete('files', file._id)
      freed += file.size
    }
    if (freed) {
      await ctx.db.patch('businesses', ctx.business._id, {
        storageBytes: Math.max(0, ctx.business.storageBytes - freed),
      })
    }

    const blank = {
      name: ANONYMOUS_CLIENT_NAME,
      kind: 'person' as const,
      phones: [],
      email: undefined,
      address: undefined,
      note: undefined,
      preferredChannel: undefined,
      consent: {},
      extra: {},
      anonymizedAt: Date.now(),
    }
    await ctx.db.patch('clients', clientId, {
      ...blank,
      searchText: await clientSearchText(ctx, { ...client, ...blank }),
    })
    for (const job of await ctx.db
      .query('jobs')
      .withIndex('by_client', (q) => q.eq('clientId', clientId))
      .collect()) {
      await ctx.db.patch('jobs', job._id, {
        searchText: await jobSearchText(ctx, job),
      })
    }
    await logActivity(ctx, { type: 'client.anonymized', clientId })
    return null
  },
})
