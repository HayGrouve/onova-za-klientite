// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { sofiaTimeToUtc } from '../shared/dates'
import {
  expectCachesFresh,
  getDoc,
  setupBusiness,
  setupConvex,
} from './test.setup'

describe('newJob.save', () => {
  it('two required fields are enough: client and title', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const { jobId, clientId } = await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'none' },
      title: 'Ключ',
    })
    expect(clientId).toBe(noClientId)
    expect((await getDoc(t, 'jobs', jobId)).title).toBe('Ключ')
  })

  it('links the items it is started from, which must be the client’s own', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const otherId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Daikin, хол',
    })
    const foreignId = await owner.mutation(api.items.create, {
      businessId,
      clientId: otherId,
      name: 'Daikin, спалня',
    })
    const { jobId } = await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'existing', clientId },
      title: 'Профилактика',
      itemIds: [itemId],
    })
    expect((await getDoc(t, 'jobs', jobId)).itemIds).toEqual([itemId])
    const item = await owner.query(api.items.get, { businessId, itemId })
    expect(item.jobs.map((job) => job._id)).toEqual([jobId])

    await expect(
      owner.mutation(api.newJob.save, {
        businessId,
        client: { kind: 'existing', clientId },
        title: 'Друга',
        itemIds: [foreignId],
      }),
    ).rejects.toThrow(/job.otherClient/)
  })

  it('saves a new client, the job, the deposit and the appointment in one go', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const { jobId, clientId } = await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'new', name: 'Петър Колев', phone: '0899 111 222' },
      title: 'Гардероб',
      typedPriceCents: 95000,
      deposit: {
        amountCents: 30000,
        date: '2026-10-07',
        method: 'cash',
        label: 'Капаро',
      },
      when: { date: '2026-10-08', time: { hour: 10, minute: 0 } },
    })
    const client = await getDoc(t, 'clients', clientId)
    expect(client.phones).toEqual([{ e164: '+359899111222' }])
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.priceCents).toBe(95000)
    expect(job.paidCents).toBe(30000)
    expect(job.balanceCents).toBe(65000)

    const { appointments, activity } = await t.run(async (ctx) => ({
      appointments: await ctx.db.query('appointments').collect(),
      activity: await ctx.db.query('activity').collect(),
    }))
    expect(appointments).toHaveLength(1)
    expect(appointments[0].start).toBe(sofiaTimeToUtc('2026-10-08', 10, 0))
    expect(appointments[0].allDay).toBe(false)
    // One activity event per record.
    expect(activity.map((event) => event.type)).toEqual([
      'client.created',
      'job.created',
      'payment.added',
      'appointment.added',
    ])
    await expectCachesFresh(t)
  })

  it('a deposit larger than the price leaves the rest as client credit', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'existing', clientId },
      title: 'Рафт',
      typedPriceCents: 10000,
      deposit: { amountCents: 15000, date: '2026-10-07', method: 'bank' },
    })
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(5000)
    await expectCachesFresh(t)
  })

  it('a date without a time is an all-day appointment; work in steps gets a due date', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'none' },
      title: 'Огледало',
      when: { date: '2026-10-09' },
    })
    const appointment = (
      await t.run((ctx) => ctx.db.query('appointments').collect())
    )[0]
    expect(appointment.allDay).toBe(true)
    expect(appointment.clientId).toBe(noClientId)

    const { jobId } = await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'none' },
      title: 'Кухня',
      dueDate: '2026-10-20',
    })
    expect((await getDoc(t, 'jobs', jobId)).dueDate).toBe('2026-10-20')
  })

  it('rejects a bad time and an invalid phone without saving anything', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await expect(
      owner.mutation(api.newJob.save, {
        businessId,
        client: { kind: 'none' },
        title: 'Шкаф',
        when: { date: '2026-10-09', time: { hour: 25, minute: 0 } },
      }),
    ).rejects.toThrow(/invalid/)
    await expect(
      owner.mutation(api.newJob.save, {
        businessId,
        client: { kind: 'new', name: 'X', phone: '12' },
        title: 'Шкаф',
      }),
    ).rejects.toThrow(/invalid/)
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(0)
  })

  it('context lists clients for the picker, without "No client"', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван',
      phones: [{ number: '0888123456' }],
    })
    const context = await owner.query(api.newJob.context, { businessId })
    expect(context.clients).toEqual([
      expect.objectContaining({ name: 'Иван', phones: ['+359888123456'] }),
    ])
  })
})

describe('newJob.save with repeat', () => {
  it('a weekly job from "+" is set to repeat from its date', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const { jobId } = await owner.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'none' },
      title: 'Почистване',
      when: { date: '2026-10-09', time: { hour: 8, minute: 0 } },
      repeat: { every: 1, unit: 'week' },
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.repeat).toEqual({ every: 1, unit: 'week' })
    expect(job.nextRepeatOn).toBe('2026-10-09')
  })
})
