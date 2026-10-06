// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import {
  STRANGER,
  getDoc,
  lastActivity,
  setupBusiness,
  setupConvex,
  storeBlob,
} from './test.setup'
import type { TestConvex } from './test.setup'

const MB = 1024 * 1024

async function withJob() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Мария Георгиева',
  })
  const jobId = await b.owner.mutation(api.jobs.create, {
    businessId: b.businessId,
    clientId,
    title: 'Гардероб',
  })
  return { t, ...b, clientId, jobId, target: { kind: 'job' as const, jobId } }
}

async function storageBytes(
  t: TestConvex,
  businessId: Parameters<typeof getDoc<'businesses'>>[2],
) {
  return (await getDoc(t, 'businesses', businessId)).storageBytes
}

describe('files', () => {
  it('storageBytes goes up on save and down on remove', async () => {
    const { t, owner, businessId, jobId, clientId, target } = await withJob()
    const photo = await storeBlob(t, 1000, 'image/png')
    const pdf = await storeBlob(t, 500, 'application/pdf')
    const saved = await owner.mutation(api.files.save, {
      businessId,
      storageId: photo,
      target,
      name: 'Преди',
    })
    if (!('fileId' in saved) || !saved.fileId) throw new Error('rejected')
    const log = await lastActivity(t)
    expect(log.type).toBe('file.added')
    expect(log.jobId).toBe(jobId)
    expect(log.clientId).toBe(clientId)
    expect(log.data.name).toBe('Преди')
    const second = await owner.mutation(api.files.save, {
      businessId,
      storageId: pdf,
      target,
    })
    if (!('fileId' in second) || !second.fileId) throw new Error('rejected')
    expect(await storageBytes(t, businessId)).toBe(1500)

    const listed = await owner.query(api.files.list, { businessId, target })
    expect(listed.map((file) => file.kind)).toEqual(['file', 'photo'])
    expect(listed[1].url).toContain('http')

    await owner.mutation(api.files.remove, { businessId, fileId: saved.fileId })
    expect(await storageBytes(t, businessId)).toBe(500)
    expect((await lastActivity(t)).type).toBe('file.removed')
    expect(
      await t.run((ctx) => ctx.db.system.get('_storage', photo)),
    ).toBeNull()
    await owner.mutation(api.files.remove, {
      businessId,
      fileId: second.fileId,
    })
    expect(await storageBytes(t, businessId)).toBe(0)
  })

  it('rejects a wrong type and deletes the blob', async () => {
    const { t, owner, businessId, target } = await withJob()
    const storageId = await storeBlob(t, 100, 'text/html')
    const result = await owner.mutation(api.files.save, {
      businessId,
      storageId,
      target,
    })
    expect(result).toEqual({ rejected: 'type' })
    expect(
      await t.run((ctx) => ctx.db.system.get('_storage', storageId)),
    ).toBeNull()
    expect(await storageBytes(t, businessId)).toBe(0)
  })

  it('rejects an oversize photo and an oversize PDF and deletes the blobs', async () => {
    const { t, owner, businessId, target } = await withJob()
    const photo = await storeBlob(t, 10 * MB + 1, 'image/jpeg')
    const pdf = await storeBlob(t, 20 * MB + 1, 'application/pdf')
    for (const storageId of [photo, pdf]) {
      const result = await owner.mutation(api.files.save, {
        businessId,
        storageId,
        target,
      })
      expect(result).toEqual({ rejected: 'size' })
      expect(
        await t.run((ctx) => ctx.db.system.get('_storage', storageId)),
      ).toBeNull()
    }
    expect(await storageBytes(t, businessId)).toBe(0)
    expect(await t.run((ctx) => ctx.db.query('files').collect())).toEqual([])
  })

  it("a stranger can't save to another business's job", async () => {
    const { t, businessId, target } = await withJob()
    const stranger = await setupBusiness(t, STRANGER)
    const storageId = await storeBlob(t, 100, 'image/png')
    await expect(
      stranger.owner.mutation(api.files.save, {
        businessId: stranger.businessId,
        storageId,
        target,
      }),
    ).rejects.toThrow(/notFound/)
    await expect(
      stranger.owner.mutation(api.files.save, {
        businessId,
        storageId,
        target,
      }),
    ).rejects.toThrow(/auth.notMember/)
  })

  it('cleanupOrphans removes only old blobs no file points to', async () => {
    const { t, owner, businessId, target } = await withJob()
    const kept = await storeBlob(t, 100, 'image/png')
    await owner.mutation(api.files.save, {
      businessId,
      storageId: kept,
      target,
    })
    const orphan = await storeBlob(t, 100, 'image/png')
    const fresh = await storeBlob(t, 100, 'image/png')
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000)
    try {
      const recent = await storeBlob(t, 100, 'image/png')
      await t.mutation(internal.files.cleanupOrphans, {})
      const exists = (id: typeof kept) =>
        t.run((ctx) => ctx.db.system.get('_storage', id))
      expect(await exists(kept)).not.toBeNull()
      expect(await exists(orphan)).toBeNull()
      expect(await exists(fresh)).toBeNull()
      expect(await exists(recent)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
