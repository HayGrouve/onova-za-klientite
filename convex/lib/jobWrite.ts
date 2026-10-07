import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { lineTotalCents } from '../../shared/money'
import { defaultStage } from '../../shared/stages'
import { vExtra, vJobLine } from '../validators'
import { logActivity } from './activity'
import { getOwned } from './auth'
import type { BusinessMutationCtx } from './auth'
import { fail } from './errors'
import { mergeExtra } from './extra'
import { recomputeJob } from './recompute'
import { jobSearchText } from './search'
import { cents, optionalDate, optionalText, requiredText } from './validate'

export const vCreateJobArgs = v.object({
  clientId: v.id('clients'),
  title: v.string(),
  stageId: v.optional(v.id('stages')),
  lines: v.optional(v.array(vJobLine)),
  typedPriceCents: v.optional(v.number()),
  dueDate: v.optional(v.string()),
  address: v.optional(v.string()),
  notes: v.optional(v.string()),
  itemIds: v.optional(v.array(v.id('items'))),
  extra: v.optional(vExtra),
  source: v.optional(
    v.union(v.literal('manual'), v.literal('phone'), v.literal('online')),
  ),
})

export type CreateJobArgs = Infer<typeof vCreateJobArgs>

export async function businessStages(ctx: BusinessMutationCtx) {
  return await ctx.db
    .query('stages')
    .withIndex('by_business_order', (q) => q.eq('businessId', ctx.business._id))
    .collect()
}

/** Items on a job must belong to the job's client. */
async function checkItems(
  ctx: BusinessMutationCtx,
  clientId: Id<'clients'>,
  itemIds: Array<Id<'items'>>,
  // An item already on the job stays allowed after it moves: that is history.
  alreadyLinked: Array<Id<'items'>> = [],
) {
  const unique = [...new Set(itemIds)]
  for (const itemId of unique) {
    const item = await getOwned(ctx, 'items', itemId)
    if (item.clientId !== clientId && !alreadyLinked.includes(itemId)) {
      fail('job.otherClient', { itemId })
    }
  }
  return unique
}

async function syncJobItems(
  ctx: BusinessMutationCtx,
  jobId: Id<'jobs'>,
  itemIds: Array<Id<'items'>>,
) {
  const existing = await ctx.db
    .query('jobItems')
    .withIndex('by_job', (q) => q.eq('jobId', jobId))
    .collect()
  const wanted = new Set<string>(itemIds)
  for (const row of existing) {
    if (!wanted.has(row.itemId)) await ctx.db.delete('jobItems', row._id)
  }
  const have = new Set<string>(existing.map((row) => row.itemId))
  for (const itemId of itemIds) {
    if (!have.has(itemId)) {
      await ctx.db.insert('jobItems', {
        businessId: ctx.business._id,
        jobId,
        itemId,
      })
    }
  }
}

/** Sets the items a job is linked to, and logs it. Callers check roles. */
export async function setJobItems(
  ctx: BusinessMutationCtx,
  job: Doc<'jobs'>,
  itemIds: Array<Id<'items'>>,
) {
  const checked = await checkItems(ctx, job.clientId, itemIds, job.itemIds)
  await ctx.db.patch('jobs', job._id, { itemIds: checked })
  await syncJobItems(ctx, job._id, checked)
  await logActivity(ctx, {
    type: 'job.itemsChanged',
    jobId: job._id,
    clientId: job.clientId,
  })
}

export async function checkLines(
  ctx: BusinessMutationCtx,
  lines: Array<Doc<'jobs'>['lines'][number]>,
) {
  const ids = new Set<string>()
  return await Promise.all(
    lines.map(async (line) => {
      if (!line.id || ids.has(line.id)) fail('invalid', { field: 'lines' })
      ids.add(line.id)
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        fail('invalid', { field: 'quantity' })
      }
      cents(line.unitPriceCents, 'unitPriceCents')
      if (
        !Number.isSafeInteger(
          lineTotalCents(line.quantity, line.unitPriceCents),
        )
      ) {
        fail('invalid', { field: 'quantity' })
      }
      if (line.serviceId) await getOwned(ctx, 'services', line.serviceId)
      return {
        ...line,
        description: requiredText(line.description, 'description', 300),
      }
    }),
  )
}

/** Creates a job with its items and caches, and logs it. Callers check roles. */
export async function createJob(ctx: BusinessMutationCtx, args: CreateJobArgs) {
  const client = await getOwned(ctx, 'clients', args.clientId)
  const stage = args.stageId
    ? await getOwned(ctx, 'stages', args.stageId)
    : defaultStage(await businessStages(ctx))
  if (!stage) fail('notFound', { table: 'stages' })

  const itemIds = await checkItems(ctx, client._id, args.itemIds ?? [])
  const lines = await checkLines(ctx, args.lines ?? [])
  const title = requiredText(args.title, 'title')
  const extra = await mergeExtra(ctx, ctx.business._id, 'job', args.extra)
  const now = Date.now()

  const job = {
    businessId: ctx.business._id,
    clientId: client._id,
    title,
    stageId: stage._id,
    stageGroup: stage.group,
    stageChangedAt: now,
    ...(stage.group === 'done' ? { doneAt: now } : {}),
    lines,
    typedPriceCents:
      args.typedPriceCents === undefined
        ? undefined
        : cents(args.typedPriceCents, 'typedPriceCents'),
    dueDate: optionalDate(args.dueDate, 'dueDate'),
    // D3: copied from the client when the job is created, then editable.
    address: optionalText(args.address, 'address', 500) ?? client.address,
    notes: optionalText(args.notes, 'notes', 10_000),
    itemIds,
    assigneeIds: [],
    source: args.source ?? 'manual',
    extra,
    priceCents: 0,
    paidCents: 0,
    costCents: 0,
    balanceCents: 0,
    owes: false,
    searchText: '',
    createdBy: ctx.member._id,
  }
  const jobId = await ctx.db.insert('jobs', {
    ...job,
    searchText: await jobSearchText(ctx, job),
  })
  await syncJobItems(ctx, jobId, itemIds)
  await recomputeJob(ctx, jobId)
  await logActivity(ctx, {
    type: 'job.created',
    jobId,
    clientId: client._id,
    data: { name: title },
  })
  return jobId
}
