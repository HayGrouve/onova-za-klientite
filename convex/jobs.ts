import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { stagesFor } from '../shared/stages'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import { fail } from './lib/errors'
import { mergeExtra } from './lib/extra'
import { moveJobToStage } from './lib/moveJob'
import {
  businessStages,
  checkItems,
  checkLines,
  createJob,
  syncJobItems,
  vCreateJobArgs,
} from './lib/jobWrite'
import { recomputeJob } from './lib/recompute'
import { jobSearchText } from './lib/search'
import { cents, optionalDate, optionalText, requiredText } from './lib/validate'
import { vExtra, vJobLine } from './validators'

const vClearableString = v.optional(v.union(v.string(), v.null()))

export const create = businessMutation({
  args: vCreateJobArgs.fields,
  returns: v.id('jobs'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    return await createJob(ctx, args)
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
    if (job.stageGroup === 'cancelled') return null
    const stages = await businessStages(ctx)
    let stage = stages.find((item) => item.group === 'cancelled')
    if (!stage) {
      // Cancelled may be emptied in Settings; cancelling brings its stage back.
      const draft = stagesFor(ctx.business.jobFlow).find(
        (item) => item.group === 'cancelled',
      )!
      const stageId = await ctx.db.insert('stages', {
        businessId: ctx.business._id,
        ...draft,
        order: (stages.at(-1)?.order ?? -1) + 1,
        visibleToClient: false,
      })
      stage = (await ctx.db.get('stages', stageId))!
    }
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
    const itemIds = await checkItems(
      ctx,
      job.clientId,
      args.itemIds,
      job.itemIds,
    )
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
