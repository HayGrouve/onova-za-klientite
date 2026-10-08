import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { BOARD_CLOSED_LIMIT, boardColumn } from '../shared/board'
import { STAGE_GROUPS, isOpenGroup, stagesFor } from '../shared/stages'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import { mergeExtra } from './lib/extra'
import { listExtra, listFieldIds } from './lib/listFields'
import { moveJobToStage } from './lib/moveJob'
import {
  businessStages,
  checkLines,
  createJob,
  setJobItems,
  vCreateJobArgs,
} from './lib/jobWrite'
import { patchJob } from './lib/ledger'
import { getVisibleFromUrl, isWorker, seesEvent, seesJob } from './lib/scope'
import type { JobPatch } from './lib/ledger'
import { jobDate, refreshRepeat, setJobRepeat } from './lib/repeat'
import { jobSearchText } from './lib/search'
import { cents, optionalDate, optionalText, requiredText } from './lib/validate'
import {
  activeFields,
  jobRow,
  newLookups,
  openRemindersOn,
  timeline,
  vJobRow,
} from './lib/views'
import { vExtra, vJobLine, vRepeatUnit, vStageGroup } from './validators'

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
    const patch: JobPatch = {}
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
    await patchJob(ctx, job._id, patch)
    // A repeating job without appointments takes its date from the due date.
    if (args.dueDate !== undefined) await refreshRepeat(ctx, job._id)
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
    await patchJob(ctx, job._id, { lines })
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
    await setJobItems(ctx, job, args.itemIds)
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
    await patchJob(ctx, job._id, {
      writeOff: { amountCents, note, at: Date.now(), by: ctx.member._id },
    })
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
    await patchJob(ctx, job._id, { writeOff: undefined })
    await logActivity(ctx, {
      type: 'job.writeOffRemoved',
      jobId: job._id,
      clientId: job.clientId,
      data: { amountCents: job.writeOff.amountCents },
    })
    return null
  },
})

const LIST_LIMIT = 500

/**
 * Jobs of one stage group (or of every group, without one: the table's "all"
 * tab), newest first, plus the count of each group for the tabs.
 */
export const list = businessQuery({
  args: { group: v.optional(vStageGroup) },
  returns: v.object({
    jobs: v.array(vJobRow),
    counts: v.object({
      new: v.number(),
      in_progress: v.number(),
      done: v.number(),
      cancelled: v.number(),
    }),
  }),
  handler: async (ctx, { group }) => {
    const businessId = ctx.business._id
    const counts = { new: 0, in_progress: 0, done: 0, cancelled: 0 }
    const selected: Array<Doc<'jobs'>> = []
    for (const key of STAGE_GROUPS) {
      const jobs = (
        await ctx.db
          .query('jobs')
          .withIndex('by_business_group_due', (q) =>
            q.eq('businessId', businessId).eq('stageGroup', key),
          )
          .take(LIST_LIMIT)
      ).filter((job) => seesJob(ctx.member, job))
      counts[key] = jobs.length
      if (group === undefined || key === group) selected.push(...jobs)
    }
    const lookups = newLookups()
    const rows = []
    for (const job of selected.sort(
      (a, b) => b._creationTime - a._creationTime,
    )) {
      rows.push(await jobRow(ctx, job, lookups))
    }
    return { jobs: rows, counts }
  },
})

/**
 * The jobs board on a wide screen: one column per stage group in board order
 * (shared/board), and the stages a job can be dropped on.
 */
export const board = businessQuery({
  args: {},
  returns: v.object({
    columns: v.array(
      v.object({
        group: vStageGroup,
        jobs: v.array(vJobRow),
        /**
         * Done jobs that still owe but are older than the cards shown, so the
         * "owing" filter finds every one of them.
         */
        olderOwing: v.array(vJobRow),
        total: v.number(),
        owedCents: v.number(),
      }),
    ),
    stages: v.array(
      v.object({ _id: v.id('stages'), name: v.string(), group: vStageGroup }),
    ),
  }),
  handler: async (ctx) => {
    const businessId = ctx.business._id
    const lookups = newLookups()
    const now = Date.now()
    const worker = isWorker(ctx.member)
    const columns = []
    for (const group of STAGE_GROUPS) {
      const jobs = (
        await ctx.db
          .query('jobs')
          .withIndex('by_business_group_due', (q) =>
            q.eq('businessId', businessId).eq('stageGroup', group),
          )
          .take(LIST_LIMIT)
      ).filter((job) => seesJob(ctx.member, job))
      let column = boardColumn(group, jobs)
      let olderOwing: typeof jobs = []
      // A Worker's own jobs are few, so their closed ones come from `jobs`.
      if (!isOpenGroup(group) && !worker) {
        // A long history outgrows one read, so the latest closed jobs come
        // from their own index, and what Done still owes from the owes index.
        const latest = await ctx.db
          .query('jobs')
          .withIndex('by_business_group_done', (q) =>
            q.eq('businessId', businessId).eq('stageGroup', group),
          )
          .order('desc')
          .take(BOARD_CLOSED_LIMIT)
        const owing =
          group === 'done'
            ? await ctx.db
                .query('jobs')
                .withIndex('by_business_owes', (q) =>
                  q
                    .eq('businessId', businessId)
                    .eq('owes', true)
                    .eq('stageGroup', 'done'),
                )
                .collect()
            : []
        column = {
          jobs: boardColumn(group, latest).jobs,
          total: column.total,
          owedCents: boardColumn(group, owing).owedCents,
        }
        const shown = new Set(column.jobs.map((job) => job._id))
        olderOwing = boardColumn(
          group,
          owing.filter((job) => !shown.has(job._id)),
          owing.length,
        ).jobs
      }
      const rows = async (from: typeof jobs) => {
        const out = []
        for (const job of from) out.push(await jobRow(ctx, job, lookups, now))
        return out
      }
      columns.push({
        ...column,
        // A Worker sees no totals (D89).
        owedCents: worker ? 0 : column.owedCents,
        group,
        jobs: await rows(column.jobs),
        olderOwing: await rows(olderOwing),
      })
    }
    const stages = await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) => q.eq('businessId', businessId))
      .collect()
    return {
      columns,
      stages: stages.map(({ _id, name, group }) => ({ _id, name, group })),
    }
  },
})

/** Everything the job page shows. */
export const get = businessQuery({
  // A string: the id comes from the address bar (see getOwnedFromUrl).
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const job = await getVisibleFromUrl(ctx, 'jobs', jobId)
    const worker = isWorker(ctx.member)
    const client = await ctx.db.get('clients', job.clientId)
    const stages = await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) =>
        q.eq('businessId', ctx.business._id),
      )
      .collect()
    const appointments = await ctx.db
      .query('appointments')
      .withIndex('by_job', (q) => q.eq('jobId', job._id))
      .collect()
    const items = []
    const shownItemFields = await listFieldIds(ctx, ctx.business._id, 'item')
    for (const itemId of job.itemIds) {
      const item = await ctx.db.get('items', itemId)
      if (item) {
        items.push({
          _id: item._id,
          name: item.name,
          listExtra: listExtra(item.extra, shownItemFields),
        })
      }
    }
    const allocations = await ctx.db
      .query('allocations')
      .withIndex('by_job', (q) => q.eq('jobId', job._id))
      .collect()
    const payments = []
    for (const allocation of allocations) {
      const payment = await ctx.db.get('payments', allocation.paymentId)
      if (!payment) continue
      payments.push({
        _id: allocation._id,
        paymentId: payment._id,
        amountCents: allocation.amountCents,
        // A Worker sees this job's share, never what the rest went to (D89).
        paymentAmountCents: worker
          ? allocation.amountCents
          : payment.amountCents,
        paymentAllocatedCents: worker
          ? allocation.amountCents
          : payment.allocatedCents,
        date: payment.date,
        method: payment.method,
        label: payment.label,
      })
    }
    payments.sort((a, b) => b.date.localeCompare(a.date))
    const costs =
      ctx.business.modules.costs && !worker
        ? await ctx.db
            .query('costs')
            .withIndex('by_job', (q) => q.eq('jobId', job._id))
            .collect()
        : []
    const events = (
      await ctx.db
        .query('activity')
        .withIndex('by_job', (q) => q.eq('jobId', job._id))
        .collect()
    ).filter((event) => seesEvent(ctx.member, event))
    return {
      job,
      client: client && {
        _id: client._id,
        name: client.name,
        isNoClient: client.isNoClient,
        phones: client.phones,
        creditCents: worker ? 0 : client.creditCents,
      },
      stages: stages.map(({ _id, name, color, group }) => ({
        _id,
        name,
        color,
        group,
      })),
      appointments: appointments
        .filter((item) => item.cancelledAt === undefined)
        .sort((a, b) => a.start - b.start),
      items,
      payments,
      costs: costs.sort((a, b) => b.date.localeCompare(a.date)),
      fields: await activeFields(ctx, ctx.business._id, 'job'),
      reminders: await openRemindersOn(ctx, ctx.business, { jobId: job._id }),
      timeline: await timeline(ctx, events),
    }
  },
})

/** Turns repeating on for a job (Q6). It needs a date: an appointment or a due date. */
export const setRepeat = businessMutation({
  args: {
    jobId: v.id('jobs'),
    every: v.number(),
    unit: vRepeatUnit,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    if (!(await jobDate(ctx, job))) fail('job.noDate')
    await setJobRepeat(ctx, job, args)
    return null
  },
})

/** "Stop repeating": no more jobs are created for this series from here. */
export const stopRepeat = businessMutation({
  args: { jobId: v.id('jobs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const job = await getOwned(ctx, 'jobs', args.jobId)
    if (!job.repeat || job.repeat.stoppedAt !== undefined) return null
    await ctx.db.patch('jobs', job._id, {
      repeat: { ...job.repeat, stoppedAt: Date.now() },
      nextRepeatOn: undefined,
    })
    await logActivity(ctx, {
      type: 'job.repeatStopped',
      jobId: job._id,
      clientId: job.clientId,
    })
    return null
  },
})
