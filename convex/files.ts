import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { fail } from './lib/errors'
import { optionalText } from './lib/validate'

const MB = 1024 * 1024
const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]
const PDF_TYPE = 'application/pdf'
const MAX_IMAGE_BYTES = 10 * MB
const MAX_PDF_BYTES = 20 * MB

/** Uploads no record points to are removed after this long (D14). */
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000
const CLEANUP_PAGE = 100

const vTarget = v.union(
  v.object({ kind: v.literal('job'), jobId: v.id('jobs') }),
  v.object({ kind: v.literal('client'), clientId: v.id('clients') }),
  v.object({ kind: v.literal('item'), itemId: v.id('items') }),
  // The business logo (Settings → Business). Images only; replaces the old one.
  v.object({ kind: v.literal('logo') }),
)

type Target = typeof vTarget.type

/** The owned record a file hangs on, as the ids the `files` row and the log carry. */
async function resolveTarget(
  ctx: Parameters<typeof getOwned>[0],
  target: Target,
) {
  if (target.kind === 'job') {
    const job = await getOwned(ctx, 'jobs', target.jobId)
    return { jobId: job._id, clientId: job.clientId }
  }
  if (target.kind === 'client') {
    const client = await getOwned(ctx, 'clients', target.clientId)
    return { clientId: client._id }
  }
  if (target.kind === 'logo') return {}
  const item = await getOwned(ctx, 'items', target.itemId)
  return { itemId: item._id, clientId: item.clientId }
}

export const generateUploadUrl = businessMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    requireRole(ctx.member, 'manager')
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Registers an uploaded blob. The size and type come from the storage
 * metadata, never from the client (D14). A rejected blob is deleted and
 * reported in the result: throwing would roll the delete back.
 */
export const save = businessMutation({
  args: {
    storageId: v.id('_storage'),
    target: vTarget,
    name: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ fileId: v.id('files') }),
    v.object({ rejected: v.union(v.literal('type'), v.literal('size')) }),
  ),
  handler: async (ctx, args) => {
    requireRole(ctx.member, args.target.kind === 'logo' ? 'owner' : 'manager')
    const links = await resolveTarget(ctx, args.target)
    const meta = await ctx.db.system.get('_storage', args.storageId)
    if (!meta) fail('notFound', { table: '_storage' })
    const mimeType = (meta.contentType ?? '').toLowerCase()
    const isImage = IMAGE_TYPES.includes(mimeType)
    if (
      (!isImage && mimeType !== PDF_TYPE) ||
      (args.target.kind === 'logo' && !isImage)
    ) {
      await ctx.storage.delete(args.storageId)
      return { rejected: 'type' as const }
    }
    if (meta.size > (isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)) {
      await ctx.storage.delete(args.storageId)
      return { rejected: 'size' as const }
    }
    const name = optionalText(args.name, 'name', 200)
    const fileId = await ctx.db.insert('files', {
      businessId: ctx.business._id,
      storageId: args.storageId,
      kind: isImage ? 'photo' : 'file',
      mimeType,
      size: meta.size,
      name,
      ...(args.target.kind === 'job' ? { jobId: links.jobId } : {}),
      ...(args.target.kind === 'client' ? { clientId: links.clientId } : {}),
      ...(args.target.kind === 'item' ? { itemId: links.itemId } : {}),
      visibleToClient: false,
      uploadedBy: ctx.member._id,
    })
    let storageBytes = ctx.business.storageBytes + meta.size
    if (args.target.kind === 'logo') {
      const old = ctx.business.logoFileId
        ? await ctx.db.get('files', ctx.business.logoFileId)
        : null
      if (old) {
        await ctx.storage.delete(old.storageId)
        await ctx.db.delete('files', old._id)
        storageBytes = Math.max(0, storageBytes - old.size)
      }
      await ctx.db.patch('businesses', ctx.business._id, {
        logoFileId: fileId,
        storageBytes,
      })
      return { fileId }
    }
    await ctx.db.patch('businesses', ctx.business._id, { storageBytes })
    await logActivity(ctx, {
      type: 'file.added',
      jobId: links.jobId,
      clientId: links.clientId,
      itemId: links.itemId,
      data: name ? { name } : {},
    })
    return { fileId }
  },
})

export const remove = businessMutation({
  args: { fileId: v.id('files') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')
    const file = await getOwned(ctx, 'files', args.fileId)
    const isLogo = ctx.business.logoFileId === file._id
    if (isLogo) requireRole(ctx.member, 'owner')
    await ctx.storage.delete(file.storageId)
    await ctx.db.delete('files', file._id)
    await ctx.db.patch('businesses', ctx.business._id, {
      storageBytes: Math.max(0, ctx.business.storageBytes - file.size),
      ...(isLogo ? { logoFileId: undefined } : {}),
    })
    if (isLogo) return null
    await logActivity(ctx, {
      type: 'file.removed',
      jobId: file.jobId,
      clientId: file.clientId,
      itemId: file.itemId,
      data: file.name ? { name: file.name } : {},
    })
    return null
  },
})

export const list = businessQuery({
  args: { target: vTarget },
  returns: v.array(
    v.object({
      _id: v.id('files'),
      _creationTime: v.number(),
      kind: v.union(v.literal('photo'), v.literal('file')),
      mimeType: v.string(),
      size: v.number(),
      name: v.optional(v.string()),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { target } = args
    let files: Doc<'files'>[]
    if (target.kind === 'job') {
      await getOwned(ctx, 'jobs', target.jobId)
      files = await ctx.db
        .query('files')
        .withIndex('by_job', (q) => q.eq('jobId', target.jobId))
        .order('desc')
        .collect()
    } else if (target.kind === 'client') {
      await getOwned(ctx, 'clients', target.clientId)
      files = await ctx.db
        .query('files')
        .withIndex('by_client', (q) => q.eq('clientId', target.clientId))
        .order('desc')
        .collect()
    } else if (target.kind === 'logo') {
      const logo = ctx.business.logoFileId
        ? await ctx.db.get('files', ctx.business.logoFileId)
        : null
      files = logo ? [logo] : []
    } else {
      await getOwned(ctx, 'items', target.itemId)
      files = await ctx.db
        .query('files')
        .withIndex('by_item', (q) => q.eq('itemId', target.itemId))
        .order('desc')
        .collect()
    }
    return await Promise.all(
      files.map(async (file) => ({
        _id: file._id,
        _creationTime: file._creationTime,
        kind: file.kind,
        mimeType: file.mimeType,
        size: file.size,
        name: file.name,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    )
  },
})

/**
 * Deletes blobs older than a day that no `files` row points to: uploads that
 * were never saved or were rejected by a failed call (D14). Works through
 * `_storage` in pages and reschedules itself until it reaches the end.
 */
export const cleanupOrphans = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - ORPHAN_AGE_MS
    const page = await ctx.db.system.query('_storage').paginate({
      cursor: args.cursor ?? null,
      numItems: CLEANUP_PAGE,
    })
    for (const blob of page.page) {
      if (blob._creationTime > cutoff) continue
      const used = await ctx.db
        .query('files')
        .withIndex('by_storage', (q) => q.eq('storageId', blob._id))
        .first()
      if (!used) await ctx.storage.delete(blob._id)
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.files.cleanupOrphans, {
        cursor: page.continueCursor,
      })
    }
    return null
  },
})
