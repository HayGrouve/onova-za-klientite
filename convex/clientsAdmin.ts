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
 * The client and every client merged into it, directly or through another
 * merge: all of them hold the same person's data.
 */
async function withMergedClients(
  ctx: BusinessMutationCtx,
  client: Doc<'clients'>,
) {
  const found = [client]
  const seen = new Set<Id<'clients'>>([client._id])
  // `found` grows while it is walked: each client brings the ones merged into it.
  for (const current of found) {
    const merged = await ctx.db
      .query('clients')
      .withIndex('by_merged_into', (q) => q.eq('mergedIntoId', current._id))
      .collect()
    for (const row of merged) {
      if (seen.has(row._id) || row.businessId !== ctx.business._id) continue
      seen.add(row._id)
      found.push(row)
    }
  }
  return found
}

/**
 * Drops the personal values from the `client.*` events about a client (the
 * name it was added or merged under, the names it was renamed from and to).
 * The rows stay, so the history still shows that something happened.
 */
async function blankClientEvents(
  ctx: BusinessMutationCtx,
  clientId: Id<'clients'>,
) {
  const events = await ctx.db
    .query('activity')
    .withIndex('by_client', (q) => q.eq('clientId', clientId))
    .collect()
  for (const event of events) {
    if (event.type === 'client.created') {
      await ctx.db.patch('activity', event._id, {
        data: { name: ANONYMOUS_CLIENT_NAME },
      })
    } else if (event.type === 'client.merged') {
      await ctx.db.patch('activity', event._id, {
        data: {
          from: ANONYMOUS_CLIENT_NAME,
          fromId: event.data.fromId,
          toId: event.data.toId,
        },
      })
    } else if (event.type === 'client.edited') {
      await ctx.db.patch('activity', event._id, { data: {} })
    }
  }
}

/**
 * Anonymize on request (GDPR, Q11): name, contacts, extra fields, consent,
 * the messages log and the client's own files go, and so do the names in the
 * client's own history and in the records merged into it. Jobs, money, items
 * and job files stay. It can't be undone.
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
    // The clients merged into this one are the same person, and still hold
    // their old name and contacts.
    for (const row of await withMergedClients(ctx, client)) {
      if (row._id !== clientId) {
        for (const phone of await ctx.db
          .query('clientPhones')
          .withIndex('by_client', (q) => q.eq('clientId', row._id))
          .collect()) {
          await ctx.db.delete('clientPhones', phone._id)
        }
      }
      await ctx.db.patch('clients', row._id, {
        ...blank,
        searchText: await clientSearchText(ctx, { ...row, ...blank }),
      })
      await blankClientEvents(ctx, row._id)
    }
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
