// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { getDoc, setupBusiness, setupConvex, storeBlob } from './test.setup'

describe('Settings → Business, Names, Modules, Reminders', () => {
  it('renaming the Job word changes every word the app shows', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const settings = await owner.query(api.businesses.settings, { businessId })
    await owner.mutation(api.businesses.setWords, {
      businessId,
      words: {
        ...settings.words,
        job: { singular: ' Ремонт ', plural: 'Ремонти', gender: 'm' },
      },
    })
    const viewer = await owner.query(api.users.viewer, {})
    expect(viewer?.business?.words.job).toEqual({
      singular: 'Ремонт',
      plural: 'Ремонти',
      gender: 'm',
    })
    await expect(
      owner.mutation(api.businesses.setWords, {
        businessId,
        words: {
          ...settings.words,
          job: { singular: '', plural: 'x', gender: 'm' },
        },
      }),
    ).rejects.toThrow(/invalid/)
  })

  it('switching a module off hides it, never deletes its data', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван',
    })
    await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Golf',
    })
    const { modules } = await owner.query(api.businesses.settings, {
      businessId,
    })
    await owner.mutation(api.businesses.setModules, {
      businessId,
      modules: { ...modules, items: false },
    })
    expect((await getDoc(t, 'businesses', businessId)).modules.items).toBe(
      false,
    )
    expect(await t.run((ctx) => ctx.db.query('items').collect())).toHaveLength(
      1,
    )
  })

  it('the reminder rule takes 1 to 60 months, or off', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.businesses.setReminderRule, {
      businessId,
      months: 12,
    })
    expect((await getDoc(t, 'businesses', businessId)).reminderRule).toEqual({
      months: 12,
    })
    await owner.mutation(api.businesses.setReminderRule, {
      businessId,
      months: null,
    })
    expect(
      (await getDoc(t, 'businesses', businessId)).reminderRule,
    ).toBeUndefined()
    await expect(
      owner.mutation(api.businesses.setReminderRule, { businessId, months: 0 }),
    ).rejects.toThrow(/invalid/)
  })

  it('a new logo replaces the old one and keeps storageBytes right', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const first = await storeBlob(t, 1000, 'image/png')
    await owner.mutation(api.files.save, {
      businessId,
      storageId: first,
      target: { kind: 'logo' },
    })
    const second = await storeBlob(t, 3000, 'image/png')
    await owner.mutation(api.files.save, {
      businessId,
      storageId: second,
      target: { kind: 'logo' },
    })
    const business = await getDoc(t, 'businesses', businessId)
    expect(business.storageBytes).toBe(3000)
    expect(await t.run((ctx) => ctx.db.query('files').collect())).toHaveLength(
      1,
    )
    const pdf = await storeBlob(t, 100, 'application/pdf')
    expect(
      await owner.mutation(api.files.save, {
        businessId,
        storageId: pdf,
        target: { kind: 'logo' },
      }),
    ).toEqual({ rejected: 'type' })
    expect(
      (await owner.query(api.businesses.settings, { businessId })).logoUrl,
    ).not.toBeNull()
  })
})

describe('Settings → Services', () => {
  it('services are added, repriced, archived and reordered', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const a = await owner.mutation(api.services.add, {
      businessId,
      name: 'Монтаж',
      priceCents: 4000,
    })
    const b = await owner.mutation(api.services.add, {
      businessId,
      name: 'Оглед',
      priceCents: 2000,
    })
    await owner.mutation(api.services.update, {
      businessId,
      serviceId: a,
      priceCents: 4500,
    })
    await owner.mutation(api.services.update, {
      businessId,
      serviceId: b,
      archived: true,
    })
    await owner.mutation(api.services.reorder, {
      businessId,
      serviceIds: [b, a],
    })
    const settings = await owner.query(api.businesses.settings, { businessId })
    expect(settings.services).toEqual([
      expect.objectContaining({ name: 'Оглед', archived: true }),
      expect.objectContaining({
        name: 'Монтаж',
        priceCents: 4500,
        archived: false,
      }),
    ])
  })
})
