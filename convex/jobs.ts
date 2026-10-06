import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { lineTotalCents } from '../shared/money'
import { defaultStage } from '../shared/stages'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import { mergeExtra } from './lib/extra'
import { moveJobToStage } from './lib/moveJob'
import { recomputeJob } from './lib/recompute'
import { jobSearchText } from './lib/search'
import { cents, optionalDate, optionalText, requiredText } from './lib/validate'
import { vExtra, vJobLine } from './validators'

async function businessStages(ctx: BusinessMutationCtx) {
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
) {
  const unique = [...new Set(itemIds)]
  for (const itemId of unique) {
    const item = await getOwned(ctx, 'items', itemId)
    if (item.clientId !== clientId) fail('job.otherClient', { itemId })
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

async function checkLines(
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

const vClearableString = v.optional(v.union(v.string(), v.null()))

export const create = businessMutation({
  args: {
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
  },
  returns: v.id('jobs'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
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
  },
})

export const update = businessMutation({
  args: {
    jobId: v.id('jobs'),
    title: v.optional(v.string()),
    typedPriceCents: v.optional(v.union(v.number(), v.null())),
    dueDate: vClearableString,
    address: vClearableString,
    notes: vClearableString,
    extra: v.optional(vExtra),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const patch: Partial<Doc<'jobs'>> = {}
    if (args.title !== undefined)
      patch.title = requiredText(args.title, 'title')
    if (args.typedPriceCents !== undefined) {
      patch.typedPriceCents =
        args.typedPriceCents === null
          ? undefined
          : cents(args.typedPriceCents, 'typedPriceCents')
    }
    if (args.dueDate !== undefined) {
      patch.dueDate =
        args.dueDate === null
          ? undefined
          : optionalDate(args.dueDate, 'dueDate')
    }
    if (args.address !== undefined) {
      patch.address = optionalText(args.address ?? undefined, 'address', 500)
    }
    if (args.notes !== undefined) {
      patch.notes = optionalText(args.notes ?? undefined, 'notes', 10_000)
    }
    if (args.extra !== undefined) {
      patch.extra = await mergeExtra(
        ctx,
        ctx.business._id,
        'job',
        args.extra,
        job.extra,
      )
    }
    const next = { ...job, ...patch }
    patch.searchText = await jobSearchText(ctx, next)
    await ctx.db.patch('jobs', job._id, patch)
    await recomputeJob(ctx, job._id)
    await logActivity(ctx, {
      type: 'job.edited',
      jobId: job._id,
      clientId: job.clientId,
    })
    return null
  },
})

export const changeStage = businessMutation({
  args: {
    jobId: v.id('jobs'),
    stageId: v.id('stages'),
    cancelReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const stage = await getOwned(ctx, 'stages', args.stageId)
    if (stage._id === job.stageId) return null
    await moveJobToStage(ctx, job, stage, args.cancelReason)
    return null
  },
})

export const cancel = businessMutation({
  args: { jobId: v.id('jobs'), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const stage = (await businessStages(ctx)).find(
      (item) => item.group === 'cancelled',
    )
    if (!stage) fail('notFound', { table: 'stages' })
    if (job.stageGroup === 'cancelled') return null
    await moveJobToStage(ctx, job, stage, args.reason)
    return null
  },
})

export const setLines = businessMutation({
  args: { jobId: v.id('jobs'), lines: v.array(vJobLine) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const lines = await checkLines(ctx, args.lines)
    await ctx.db.patch('jobs', job._id, { lines })
    await recomputeJob(ctx, job._id)
    await logActivity(ctx, {
      type: 'job.linesChanged',
      jobId: job._id,
      clientId: job.clientId,
      data: { from: String(job.lines.length), to: String(lines.length) },
    })
    return null
  },
})

export const setItems = businessMutation({
  args: { jobId: v.id('jobs'), itemIds: v.array(v.id('items')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const itemIds = await checkItems(ctx, job.clientId, args.itemIds)
    await ctx.db.patch('jobs', job._id, { itemIds })
    await syncJobItems(ctx, job._id, itemIds)
    await logActivity(ctx, {
      type: 'job.itemsChanged',
      jobId: job._id,
      clientId: job.clientId,
    })
    return null
  },
})

/** Closes the unpaid rest for good, with a note (D7). */
export const writeOff = businessMutation({
  args: { jobId: v.id('jobs'), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    const note = requiredText(args.note, 'note', 500)
    const already = job.writeOff?.amountCents ?? 0
    const amountCents = already + job.balanceCents
    if (job.balanceCents <= 0) fail('payment.zero')
    await ctx.db.patch('jobs', job._id, {
      writeOff: { amountCents, note, at: Date.now(), by: ctx.member._id },
    })
    await recomputeJob(ctx, job._id)
    await logActivity(ctx, {
      type: 'job.writtenOff',
      jobId: job._id,
      clientId: job.clientId,
      data: { amountCents: job.balanceCents, note },
    })
    return null
  },
})

export const removeWriteOff = businessMutation({
  args: { jobId: v.id('jobs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    if (!job.writeOff) return null
    await ctx.db.patch('jobs', job._id, { writeOff: undefined })
    await recomputeJob(ctx, job._id)
    await logActivity(ctx, {
      type: 'job.writeOffRemoved',
      jobId: job._id,
      clientId: job.clientId,
      data: { amountCents: job.writeOff.amountCents },
    })
    return null
  },
})
