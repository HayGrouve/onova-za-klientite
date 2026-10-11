// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { DELETED_TABLE_NAMES } from './lib/businessTables'
import { defaultBusiness } from '../shared/setup'
import { addMember, setupBusiness, setupConvex, storeBlob } from './test.setup'
import type { TestBusiness, TestConvex } from './test.setup'

const DEFAULT_NAME = defaultBusiness().name

describe('businesses.createAnother', () => {
  it('allows 5 a day, then says rate.limited', async () => {
    const t = setupConvex()
    const { owner } = await setupBusiness(t)
    for (let n = 0; n < 5; n++) {
      await owner.mutation(api.businesses.createAnother, {})
    }
    await expect(
      owner.mutation(api.businesses.createAnother, {}),
    ).rejects.toThrow(/rate.limited/)
    expect(
      await t.run((ctx) => ctx.db.query('businesses').collect()),
    ).toHaveLength(6)
  })
})

describe('businesses.remove', () => {
  /** Every row of every business table that still belongs to the business. */
  async function rowsLeft(t: TestConvex, businessId: Id<'businesses'>) {
    return await t.run(async (ctx) => {
      let count = 0
      for (const table of DELETED_TABLE_NAMES) {
        count += (await ctx.db.query(table).collect()).filter(
          (row) => (row as { businessId: string }).businessId === businessId,
        ).length
      }
      return count
    })
  }

  /** The scheduled deletion steps, one table each, run to the end. */
  async function finishDeletion(t: TestConvex) {
    // The test scheduler gives up after about twenty steps in a row.
    for (let round = 0; round < 3; round++) {
      await t.finishAllScheduledFunctions(() => {})
    }
  }

  async function withData(t: TestConvex, b: TestBusiness) {
    const clientId = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Иван',
    })
    const jobId = await b.owner.mutation(api.jobs.create, {
      businessId: b.businessId,
      clientId,
      title: 'Гардероб',
      typedPriceCents: 10000,
    })
    const storageId = await storeBlob(t, 500, 'image/png')
    await b.owner.mutation(api.files.save, {
      businessId: b.businessId,
      storageId,
      target: { kind: 'job', jobId },
    })
    await b.owner.mutation(api.appointments.add, {
      businessId: b.businessId,
      jobId,
      date: '2026-11-20',
    })
  }

  it('the owner deletes a business by its name; the other one stays', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    await withData(t, b)
    const otherId = await b.owner.mutation(api.businesses.createAnother, {})
    await b.owner.mutation(api.users.setActiveBusiness, {
      businessId: b.businessId,
    })

    const next = await b.owner.mutation(api.businesses.remove, {
      businessId: b.businessId,
      confirmName: '  ' + DEFAULT_NAME.toLocaleUpperCase('bg') + ' ',
    })
    expect(next).toBe(otherId)
    // Gone from the shell at once, before the data is.
    const viewer = await b.owner.query(api.users.viewer, {})
    expect(viewer?.businesses.map((item) => item._id)).toEqual([otherId])
    expect(viewer?.business?._id).toBe(otherId)
    await expect(
      b.owner.query(api.businesses.settings, { businessId: b.businessId }),
    ).rejects.toThrow(/auth.notMember/)

    await finishDeletion(t)
    expect(await rowsLeft(t, b.businessId)).toBe(0)
    const left = await t.run(async (ctx) => ({
      business: await ctx.db.get('businesses', b.businessId),
      other: await ctx.db.get('businesses', otherId),
      storage: await ctx.db.system.query('_storage').collect(),
      users: await ctx.db.query('users').collect(),
    }))
    expect(left.business).toBeNull()
    expect(left.other).not.toBeNull()
    expect(left.storage).toEqual([])
    // Deleting a business never deletes the person.
    expect(left.users).toHaveLength(1)
    expect(await rowsLeft(t, otherId)).toBeGreaterThan(0)
  })

  it('a wrong or half-typed name deletes nothing', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    await withData(t, b)
    const before = await rowsLeft(t, b.businessId)
    for (const confirmName of ['', 'Моят', 'Друг бизнес']) {
      await expect(
        b.owner.mutation(api.businesses.remove, {
          businessId: b.businessId,
          confirmName,
        }),
      ).rejects.toThrow(/invalid/)
    }
    await finishDeletion(t)
    expect(await rowsLeft(t, b.businessId)).toBe(before)
    expect(
      await t.run((ctx) => ctx.db.query('deletionJobs').collect()),
    ).toEqual([])
  })

  it('only the owner may delete it', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { member } = await addMember(t, b, 'manager')
    await expect(
      member.mutation(api.businesses.remove, {
        businessId: b.businessId,
        confirmName: DEFAULT_NAME,
      }),
    ).rejects.toThrow(/auth.forbidden/)
  })

  it('the team loses it at once and lands in their own business', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { member } = await addMember(t, b, 'worker')
    await member.mutation(api.users.setActiveBusiness, {
      businessId: b.businessId,
    })
    await b.owner.mutation(api.businesses.createAnother, {})

    await b.owner.mutation(api.businesses.remove, {
      businessId: b.businessId,
      confirmName: DEFAULT_NAME,
    })
    const viewer = await member.query(api.users.viewer, {})
    expect(viewer?.businesses.map((item) => item._id)).not.toContain(
      b.businessId,
    )
    expect(viewer?.business?._id).not.toBe(b.businessId)
    await expect(
      member.query(api.today.list, {
        businessId: b.businessId,
        today: '2026-10-11',
      }),
    ).rejects.toThrow(/auth.notMember/)
  })

  it('deleting the only business starts a new one, with setup', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const next = await b.owner.mutation(api.businesses.remove, {
      businessId: b.businessId,
      confirmName: DEFAULT_NAME,
    })
    expect(next).not.toBe(b.businessId)
    const viewer = await b.owner.query(api.users.viewer, {})
    expect(viewer?.businesses.map((item) => item._id)).toEqual([next])
    expect(viewer?.business?.setupDone).toBe(false)
    await finishDeletion(t)
    expect(await rowsLeft(t, b.businessId)).toBe(0)
    expect(await rowsLeft(t, next)).toBeGreaterThan(0)
  })
})
