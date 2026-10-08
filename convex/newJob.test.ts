// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { sofiaTimeToUtc } from '../shared/dates'
import {
  expectCachesFresh,
  getDoc,
  setupBusiness,
  setupConvex,
  STRANGER,
} from './test.setup'
import type { TestBusiness, TestConvex } from './test.setup'

/** Turns the Items module on, as a business that keeps cars or devices would. */
async function enableItems(t: TestConvex, b: TestBusiness) {
  const business = await getDoc(t, 'businesses', b.businessId)
  await b.owner.mutation(api.businesses.setModules, {
    businessId: b.businessId,
    modules: { ...business.modules, items: true },
  })
}

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
    // The timeline says so, as when repeating is set on the job page.
    const logged = await t.run(async (ctx) =>
      (await ctx.db.query('activity').collect()).filter(
        (event) => event.jobId === jobId && event.type === 'job.repeatSet',
      ),
    )
    expect(logged).toHaveLength(1)
  })

  it('refuses a time that is not on the clock', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await expect(
      owner.mutation(api.newJob.save, {
        businessId,
        client: { kind: 'none' },
        title: 'Почистване',
        when: { date: '2026-10-09', time: { hour: 24, minute: 0 } },
      }),
    ).rejects.toThrow()
  })
})

describe('newJob.save for work already done and paid', () => {
  const walkIn = {
    client: { kind: 'none' as const },
    title: 'Зареждане с фреон',
    typedPriceCents: 4000,
    deposit: { amountCents: 4000, date: '2026-10-07', method: 'cash' as const },
  }

  it('starts in the first New stage unless it is asked to be done', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { jobId } = await b.owner.mutation(api.newJob.save, {
      businessId: b.businessId,
      ...walkIn,
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.stageGroup).toBe('new')
    expect(job.doneAt).toBeUndefined()
  })

  it('a payment that is not a deposit, and the job saved straight as done', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { jobId } = await b.owner.mutation(api.newJob.save, {
      businessId: b.businessId,
      ...walkIn,
      done: true,
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.stageGroup).toBe('done')
    expect(job.stageId).toBe(b.stage('done'))
    expect(job.doneAt).toBeDefined()
    expect(job.paidCents).toBe(4000)
    expect(job.balanceCents).toBe(0)
    expect(job.owes).toBe(false)

    const payments = await t.run((ctx) => ctx.db.query('payments').collect())
    expect(payments).toHaveLength(1)
    expect(payments[0].label).toBeUndefined()
    expect(payments[0].clientId).toBe(b.noClientId)
    await expectCachesFresh(t)
  })

  it('goes to the first Done stage in the business’s order', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    await b.owner.mutation(api.stages.add, {
      businessId: b.businessId,
      name: 'Предадено',
      group: 'done',
    })
    const { jobId } = await b.owner.mutation(api.newJob.save, {
      businessId: b.businessId,
      ...walkIn,
      done: true,
    })
    expect((await getDoc(t, 'jobs', jobId)).stageId).toBe(b.stage('done'))
  })

  it('done without a payment is allowed: the job is done and still owed', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { jobId } = await b.owner.mutation(api.newJob.save, {
      businessId: b.businessId,
      client: { kind: 'none' },
      title: 'Ключ',
      typedPriceCents: 1000,
      done: true,
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.stageGroup).toBe('done')
    expect(job.owes).toBe(true)
    expect(job.balanceCents).toBe(1000)
  })
})

describe('newJob.save with items', () => {
  async function clientWithItem(t: TestConvex, b: TestBusiness) {
    await enableItems(t, b)
    const clientId = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Георги Димитров',
    })
    const itemId = await b.owner.mutation(api.items.create, {
      businessId: b.businessId,
      clientId,
      name: 'Daikin',
    })
    return { clientId, itemId }
  }

  it('links the chosen items to the job', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { clientId, itemId } = await clientWithItem(t, b)
    const { jobId } = await b.owner.mutation(api.newJob.save, {
      businessId: b.businessId,
      client: { kind: 'existing', clientId },
      title: 'Смяна на филтри',
      typedPriceCents: 4500,
      itemIds: [itemId],
    })
    expect((await getDoc(t, 'jobs', jobId)).itemIds).toEqual([itemId])
    const links = await t.run((ctx) => ctx.db.query('jobItems').collect())
    expect(links.map((link) => [link.jobId, link.itemId])).toEqual([
      [jobId, itemId],
    ])
  })

  it('refuses an item of another client, and saves nothing', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { itemId } = await clientWithItem(t, b)
    const otherId = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Мария',
    })
    await expect(
      b.owner.mutation(api.newJob.save, {
        businessId: b.businessId,
        client: { kind: 'existing', clientId: otherId },
        title: 'Смяна на филтри',
        itemIds: [itemId],
      }),
    ).rejects.toThrow(/job.otherClient/)
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(0)
  })

  it('refuses an item of a new client or of a walk-in', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { itemId } = await clientWithItem(t, b)
    await expect(
      b.owner.mutation(api.newJob.save, {
        businessId: b.businessId,
        client: { kind: 'new', name: 'Петър Колев' },
        title: 'Смяна на филтри',
        itemIds: [itemId],
      }),
    ).rejects.toThrow(/job.otherClient/)
    await expect(
      b.owner.mutation(api.newJob.save, {
        businessId: b.businessId,
        client: { kind: 'none' },
        title: 'Смяна на филтри',
        itemIds: [itemId],
      }),
    ).rejects.toThrow(/job.otherClient/)
    expect(
      await t.run((ctx) => ctx.db.query('clients').collect()),
    ).toHaveLength(2)
  })

  it('refuses an item of another business', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const stranger = await setupBusiness(t, STRANGER)
    const { itemId } = await clientWithItem(t, stranger)
    await expect(
      b.owner.mutation(api.newJob.save, {
        businessId: b.businessId,
        client: { kind: 'none' },
        title: 'Смяна на филтри',
        itemIds: [itemId],
      }),
    ).rejects.toThrow(/notFound/)
  })
})

describe('newJob.context items', () => {
  it('lists each client’s items with the words they are searched by, when the Items module is on', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    await enableItems(t, b)
    const modelId = await b.owner.mutation(api.fields.add, {
      businessId: b.businessId,
      target: 'item',
      name: 'Модел',
      type: 'text',
    })
    const clientId = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Георги Димитров',
    })
    const itemId = await b.owner.mutation(api.items.create, {
      businessId: b.businessId,
      clientId,
      name: 'Климатик Daikin',
      extra: { [modelId]: 'FTXM35' },
    })
    const context = await b.owner.query(api.newJob.context, {
      businessId: b.businessId,
    })
    expect(context.items).toHaveLength(1)
    expect(context.items[0]).toMatchObject({
      id: itemId,
      clientId,
      name: 'Климатик Daikin',
    })
    expect(context.items[0].keys.split(' ')).toEqual(
      // Keys are stored folded (D60): x is kept as ks.
      expect.arrayContaining(['klimatik', 'daikin', 'ftksm35']),
    )
  })

  it('lists none when the Items module is off', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const clientId = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Георги Димитров',
    })
    await enableItems(t, b)
    await b.owner.mutation(api.items.create, {
      businessId: b.businessId,
      clientId,
      name: 'Daikin',
    })
    const business = await getDoc(t, 'businesses', b.businessId)
    await b.owner.mutation(api.businesses.setModules, {
      businessId: b.businessId,
      modules: { ...business.modules, items: false },
    })
    const context = await b.owner.query(api.newJob.context, {
      businessId: b.businessId,
    })
    expect(context.items).toEqual([])
  })

  it('leaves out the items of a client who is merged away or anonymized', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    await enableItems(t, b)
    const keep = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Иван Петров',
    })
    const gone = await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Иван Петров ',
    })
    await b.owner.mutation(api.items.create, {
      businessId: b.businessId,
      clientId: keep,
      name: 'Колело',
    })
    await b.owner.mutation(api.items.create, {
      businessId: b.businessId,
      clientId: gone,
      name: 'Лодка',
    })
    await t.run((ctx) => ctx.db.patch('clients', gone, { mergedIntoId: keep }))
    const context = await b.owner.query(api.newJob.context, {
      businessId: b.businessId,
    })
    expect(context.items.map((item) => item.name)).toEqual(['Колело'])
  })
})
