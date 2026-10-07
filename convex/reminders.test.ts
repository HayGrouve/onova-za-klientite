// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { getDoc, lastActivity, setupBusiness, setupConvex } from './test.setup'

describe('reminders', () => {
  it('add, done and dismiss; open ones list soonest first', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const later = await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2027-10-01',
      note: 'Годишна профилактика',
      source: 'rule',
    })
    const sooner = await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2026-11-01',
      note: 'Обади се',
    })
    expect((await lastActivity(t)).type).toBe('reminder.added')
    expect(
      (
        await owner.query(api.reminders.forClient, { businessId, clientId })
      ).map((r) => r._id),
    ).toEqual([sooner, later])
    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId: sooner,
      status: 'done',
    })
    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId: later,
      status: 'dismissed',
    })
    expect((await getDoc(t, 'reminders', later)).status).toBe('dismissed')
    expect(
      await owner.query(api.reminders.forClient, { businessId, clientId }),
    ).toEqual([])
  })

  it('a reminder on a job belongs to the job’s client', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const otherId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Друг',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Фреон',
    })
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      jobId,
      date: '2026-12-01',
      note: 'x',
    })
    expect((await getDoc(t, 'reminders', reminderId)).clientId).toBe(clientId)
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        jobId,
        clientId: otherId,
        date: '2026-12-01',
        note: 'x',
      }),
    ).rejects.toThrow(/job.otherClient/)
  })

  it('the rule never reminds about a job of the built-in No client', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const walkIn = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Бърз ремонт',
    })
    const named = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Фреон',
    })
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        jobId: walkIn,
        date: '2027-10-01',
        note: 'Бърз ремонт',
        source: 'rule',
      }),
    ).rejects.toThrow(/client.noClient/)
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        clientId: noClientId,
        date: '2027-10-01',
        note: 'x',
        source: 'rule',
      }),
    ).rejects.toThrow(/client.noClient/)
    // A rule reminder with nobody to follow up is refused too.
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        date: '2027-10-01',
        note: 'x',
        source: 'rule',
      }),
    ).rejects.toThrow(/client.noClient/)
    await owner.mutation(api.reminders.add, {
      businessId,
      jobId: named,
      date: '2027-10-01',
      note: 'Фреон',
      source: 'rule',
    })
  })
})
