import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { canChangeFieldType } from '../shared/fields'
import { logActivity } from './lib/activity'
import { businessMutation, getOwned, requireRole } from './lib/auth'
import type { BusinessMutationCtx } from './lib/auth'
import { fail } from './lib/errors'
import { clientSearchText, itemSearchText, jobSearchText } from './lib/search'
import { requiredText } from './lib/validate'
import { vFieldTarget, vFieldType } from './validators'

const MAX_OPTIONS = 50

function optionId() {
  return crypto.randomUUID().slice(0, 8)
}

async function fieldsOf(
  ctx: BusinessMutationCtx,
  target: Doc<'fields'>['target'],
) {
  return await ctx.db
    .query('fields')
    .withIndex('by_business_target_order', (q) =>
      q.eq('businessId', ctx.business._id).eq('target', target),
    )
    .collect()
}

export const add = businessMutation({
  args: {
    target: vFieldTarget,
    name: v.string(),
    type: vFieldType,
    options: v.optional(v.array(v.string())),
    showInList: v.optional(v.boolean()),
  },
  returns: v.id('fields'),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const name = requiredText(args.name, 'name', 60)
    const existing = await fieldsOf(ctx, args.target)
    const options =
      args.type === 'choice'
        ? (args.options ?? []).map((option) => ({
            id: optionId(),
            name: requiredText(option, 'options', 60),
          }))
        : undefined
    if (options && options.length > MAX_OPTIONS)
      fail('invalid', { field: 'options' })
    const fieldId = await ctx.db.insert('fields', {
      businessId: ctx.business._id,
      target: args.target,
      name,
      type: args.type,
      options,
      showInList: args.showInList ?? false,
      order: (existing.at(-1)?.order ?? -1) + 1,
      visibleToClient: false,
    })
    await logActivity(ctx, {
      type: 'field.added',
      data: { name, toId: fieldId },
    })
    return fieldId
  },
})

/** Rename, list toggle, or a type change between text and long text only. */
export const update = businessMutation({
  args: {
    fieldId: v.id('fields'),
    name: v.optional(v.string()),
    type: v.optional(vFieldType),
    showInList: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const field = await getOwned(ctx, 'fields', args.fieldId)
    const patch: Partial<Doc<'fields'>> = {}
    if (args.name !== undefined)
      patch.name = requiredText(args.name, 'name', 60)
    if (args.showInList !== undefined) patch.showInList = args.showInList
    if (args.type !== undefined && args.type !== field.type) {
      if (!canChangeFieldType(field.type, args.type)) fail('field.typeChange')
      patch.type = args.type
    }
    await ctx.db.patch('fields', field._id, patch)
    await logActivity(ctx, {
      type: 'field.edited',
      data: { from: field.name, to: patch.name ?? field.name, toId: field._id },
    })
    return null
  },
})

/** Fields are archived, never deleted. Their values stay on every record. */
export const archive = businessMutation({
  args: { fieldId: v.id('fields') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const field = await getOwned(ctx, 'fields', args.fieldId)
    if (field.archivedAt !== undefined) return null
    await ctx.db.patch('fields', field._id, { archivedAt: Date.now() })
    await logActivity(ctx, {
      type: 'field.archived',
      data: { name: field.name, toId: field._id },
    })
    return null
  },
})

/** Restoring brings the data back: it was never removed. */
export const restore = businessMutation({
  args: { fieldId: v.id('fields') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const field = await getOwned(ctx, 'fields', args.fieldId)
    if (field.archivedAt === undefined) return null
    await ctx.db.patch('fields', field._id, { archivedAt: undefined })
    await logActivity(ctx, {
      type: 'field.restored',
      data: { name: field.name, toId: field._id },
    })
    return null
  },
})

export const addOption = businessMutation({
  args: { fieldId: v.id('fields'), name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const field = await getOwned(ctx, 'fields', args.fieldId)
    if (field.type !== 'choice') fail('invalid', { field: 'type' })
    const options = field.options ?? []
    if (options.length >= MAX_OPTIONS) fail('invalid', { field: 'options' })
    const id = optionId()
    await ctx.db.patch('fields', field._id, {
      options: [...options, { id, name: requiredText(args.name, 'name', 60) }],
    })
    await logActivity(ctx, {
      type: 'field.edited',
      data: { name: field.name, toId: field._id },
    })
    return id
  },
})

/**
 * Options are stored by id, so a rename shows on every record at once. Only
 * the search keys need rebuilding, in batches.
 */
export const updateOption = businessMutation({
  args: {
    fieldId: v.id('fields'),
    optionId: v.string(),
    name: v.optional(v.string()),
    archived: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'owner')
    const field = await getOwned(ctx, 'fields', args.fieldId)
    const options = field.options ?? []
    const option = options.find((item) => item.id === args.optionId)
    if (!option) fail('notFound', { table: 'options' })
    const name =
      args.name === undefined
        ? option.name
        : requiredText(args.name, 'name', 60)
    const archivedAt =
      args.archived === undefined
        ? option.archivedAt
        : args.archived
          ? (option.archivedAt ?? Date.now())
          : undefined
    await ctx.db.patch('fields', field._id, {
      options: options.map((item) =>
        item.id === option.id ? { ...item, name, archivedAt } : item,
      ),
    })
    if (name !== option.name) {
      await ctx.scheduler.runAfter(0, internal.fields.rebuildSearch, {
        fieldId: field._id,
        cursor: null,
      })
    }
    await logActivity(ctx, {
      type: 'field.edited',
      data: { from: option.name, to: name, toId: field._id },
    })
    return null
  },
})

const REBUILD_BATCH = 100

/** Rebuilds `searchText` for the records of a field's target, a page at a time. */
export const rebuildSearch = internalMutation({
  args: { fieldId: v.id('fields'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const field = await ctx.db.get('fields', args.fieldId)
    if (!field) return null
    const businessId: Id<'businesses'> = field.businessId
    const opts = { cursor: args.cursor, numItems: REBUILD_BATCH }
    let page: { isDone: boolean; continueCursor: string }
    if (field.target === 'client') {
      const result = await ctx.db
        .query('clients')
        .withIndex('by_business_name', (q) => q.eq('businessId', businessId))
        .paginate(opts)
      for (const client of result.page) {
        if (!(field._id in client.extra)) continue
        await ctx.db.patch('clients', client._id, {
          searchText: await clientSearchText(ctx, client),
        })
      }
      page = result
    } else if (field.target === 'item') {
      const result = await ctx.db
        .query('items')
        .withIndex('by_business', (q) => q.eq('businessId', businessId))
        .paginate(opts)
      for (const item of result.page) {
        if (!(field._id in item.extra)) continue
        await ctx.db.patch('items', item._id, {
          searchText: await itemSearchText(ctx, item),
        })
      }
      page = result
    } else {
      const result = await ctx.db
        .query('jobs')
        .withIndex('by_business_group_due', (q) =>
          q.eq('businessId', businessId),
        )
        .paginate(opts)
      for (const job of result.page) {
        if (!(field._id in job.extra)) continue
        await ctx.db.patch('jobs', job._id, {
          searchText: await jobSearchText(ctx, job),
        })
      }
      page = result
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.fields.rebuildSearch, {
        fieldId: field._id,
        cursor: page.continueCursor,
      })
    }
    return null
  },
})
