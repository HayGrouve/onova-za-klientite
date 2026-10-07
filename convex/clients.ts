import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import { fail } from './lib/errors'
import {
  clientFields,
  createClient,
  normalizePhones,
  syncPhones,
  vCreateClientArgs,
} from './lib/clientWrite'
import { mergeExtra } from './lib/extra'
import { clientSearchText, jobSearchText } from './lib/search'
import { optionalText, requiredText } from './lib/validate'

export const create = businessMutation({
  args: vCreateClientArgs.fields,
  returns: v.id('clients'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    return await createClient(ctx, args)
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
