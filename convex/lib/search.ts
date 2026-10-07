import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { buildSearchText } from '../../shared/search'
import { fieldSearchText } from '../../shared/fields'

type Target = Doc<'fields'>['target']

async function extraSearchValues(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  target: Target,
  extra: Doc<'jobs'>['extra'],
): Promise<string[]> {
  if (Object.keys(extra).length === 0) return []
  const fields = await ctx.db
    .query('fields')
    .withIndex('by_business_target_order', (q) =>
      q.eq('businessId', businessId).eq('target', target),
    )
    .collect()
  return fields.flatMap((field) => {
    return field._id in extra ? [fieldSearchText(field, extra[field._id])] : []
  })
}

export async function clientSearchText(
  ctx: QueryCtx,
  client: Pick<
    Doc<'clients'>,
    'businessId' | 'name' | 'email' | 'phones' | 'address' | 'extra'
  >,
) {
  return buildSearchText([
    client.name,
    client.email,
    ...client.phones.map((phone) => phone.e164),
    client.address ? { plain: client.address } : undefined,
    ...(await extraSearchValues(
      ctx,
      client.businessId,
      'client',
      client.extra,
    )),
  ])
}

export async function itemSearchText(
  ctx: QueryCtx,
  item: Pick<Doc<'items'>, 'businessId' | 'name' | 'extra'>,
) {
  return buildSearchText([
    item.name,
    ...(await extraSearchValues(ctx, item.businessId, 'item', item.extra)),
  ])
}

export async function jobSearchText(
  ctx: QueryCtx,
  job: Pick<
    Doc<'jobs'>,
    'businessId' | 'title' | 'clientId' | 'address' | 'extra'
  >,
) {
  const client = await ctx.db.get('clients', job.clientId)
  return buildSearchText([
    job.title,
    client?.isNoClient ? undefined : client?.name,
    job.address ? { plain: job.address } : undefined,
    ...(await extraSearchValues(ctx, job.businessId, 'job', job.extra)),
  ])
}
