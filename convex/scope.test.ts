// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { addMember, setupBusiness, setupConvex } from './test.setup'
import type { TestConvex } from './test.setup'

const TODAY = '2026-10-09'

// Every module's exports, to find every public query.
const modules = import.meta.glob<Record<string, unknown>>(
  [
    './*.ts',
    '!./*.*.ts',
    '!./schema.ts',
    '!./convex.config.ts',
    '!./auth.config.ts',
    '!./validators.ts',
    '!./seedData.ts',
  ],
  { eager: true },
)

/**
 * Every public query, and what it shows a Worker. A new query fails the test
 * below until someone decides that here (D89).
 */
const WORKER_READS: Record<string, string> = {
  'businesses:settings': 'settings, read-only (D38)',
  'clients:get': 'only through their jobs, without money',
  'clients:list': 'only the clients of their jobs, without money',
  'clientsAdmin:findByPhones': 'forbidden',
  'dataExport:all': 'forbidden',
  'fields:list': 'settings',
  'files:list': 'their jobs and items; client files forbidden',
  'import:duplicatesByPhone': 'forbidden',
  'items:byClient': 'forbidden',
  'items:get': 'only through their jobs',
  'jobs:board': 'their jobs, no totals',
  'jobs:get': 'their jobs, without costs or credit',
  'jobs:list': 'their jobs',
  'money:summary': 'forbidden',
  'newJob:context': 'forbidden',
  'offline:snapshot': 'their jobs, appointments and clients',
  'payments:get': "their jobs' share only",
  'push:settings': 'their own',
  'search:all': "their jobs, and those jobs' clients and items",
  'services:list': 'settings',
  'setup:current': 'settings',
  'today:list': 'their jobs and appointments, no reminders',
  'users:viewer': 'themselves',
}

function publicQueries() {
  const names: string[] = []
  for (const [path, exports] of Object.entries(modules)) {
    const module = path.replace(/^\.\//, '').replace(/\.ts$/, '')
    for (const [exportName, value] of Object.entries(exports)) {
      const fn = value as { isPublic?: boolean; isQuery?: boolean }
      if (fn.isPublic && fn.isQuery) names.push(`${module}:${exportName}`)
    }
  }
  return names.sort()
}

/**
 * A business with a Worker, one job assigned to them and one that isn't,
 * each for its own client with its own item, appointment, payment and file.
 */
async function workerBusiness(t: TestConvex) {
  const b = await setupBusiness(t)
  const { owner, businessId } = b
  await owner.mutation(api.businesses.setModules, {
    businessId,
    modules: {
      items: true,
      appointments: true,
      costs: true,
      reminders: true,
      services: true,
    },
  })
  const { member: worker, membershipId } = await addMember(t, b, 'worker')

  async function work(name: string, title: string) {
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name,
    })
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: `${title} item`,
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title,
      typedPriceCents: 10000,
      dueDate: '2026-10-01',
    })
    await owner.mutation(api.jobs.setItems, {
      businessId,
      jobId,
      itemIds: [itemId],
    })
    const appointmentId = await owner.mutation(api.appointments.add, {
      businessId,
      jobId,
      date: TODAY,
      label: title,
    })
    await owner.mutation(api.costs.add, {
      businessId,
      jobId,
      amountCents: 1000,
      date: TODAY,
      label: 'Материали',
    })
    await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: TODAY,
      note: `${name} reminder`,
    })
    return { clientId, itemId, jobId, appointmentId }
  }

  const mine = await work('Мой клиент', 'Моя поръчка')
  const theirs = await work('Чужд клиент', 'Чужда поръчка')
  await t.run((ctx) =>
    ctx.db.patch('jobs', mine.jobId, { assigneeIds: [membershipId] }),
  )
  // One payment split across both jobs, and a credit the client holds.
  const clientId = mine.clientId
  await t.run((ctx) =>
    ctx.db.patch('jobs', theirs.jobId, { clientId: mine.clientId }),
  )
  const paymentId = await owner.mutation(api.payments.addFromClient, {
    businessId,
    clientId,
    amountCents: 15000,
    date: TODAY,
    method: 'cash',
    allocations: [
      { jobId: mine.jobId, amountCents: 4000 },
      { jobId: theirs.jobId, amountCents: 6000 },
    ],
  })
  await t.run((ctx) =>
    ctx.db.patch('jobs', theirs.jobId, { clientId: theirs.clientId }),
  )
  return { ...b, worker, membershipId, mine, theirs, paymentId }
}

describe('a Worker sees only their own work (D89)', () => {
  it('has a decision for every public query', () => {
    expect(publicQueries()).toEqual(Object.keys(WORKER_READS).sort())
  })

  it('lists only their jobs, with counts of their jobs', async () => {
    const t = setupConvex()
    const { worker, businessId, mine } = await workerBusiness(t)
    const list = await worker.query(api.jobs.list, { businessId })
    expect(list.jobs.map((job) => job._id)).toEqual([mine.jobId])
    expect(list.counts.new + list.counts.in_progress).toBe(1)

    const board = await worker.query(api.jobs.board, { businessId })
    const ids = board.columns.flatMap((column) => [
      ...column.jobs,
      ...column.olderOwing,
    ])
    expect(ids.map((job) => job._id)).toEqual([mine.jobId])
    expect(board.columns.reduce((sum, c) => sum + c.total, 0)).toBe(1)
    // A Worker sees no totals.
    expect(board.columns.every((column) => column.owedCents === 0)).toBe(true)
  })

  it("opens their job, without costs, credit or another job's share", async () => {
    const t = setupConvex()
    const { worker, businessId, mine, theirs } = await workerBusiness(t)
    await expect(
      worker.query(api.jobs.get, { businessId, jobId: theirs.jobId }),
    ).rejects.toThrow(/notFound/)
    const page = await worker.query(api.jobs.get, {
      businessId,
      jobId: mine.jobId,
    })
    expect(page.job.balanceCents).toBe(6000)
    expect(page.costs).toEqual([])
    expect(page.timeline.some((event) => event.type.startsWith('cost.'))).toBe(
      false,
    )
    expect(page.client?.creditCents).toBe(0)
    expect(page.payments).toHaveLength(1)
    expect(page.payments[0].paymentAmountCents).toBe(4000)
    expect(page.payments[0].paymentAllocatedCents).toBe(4000)
  })

  it("shows a split payment's share on their job, never the other jobs", async () => {
    const t = setupConvex()
    const { worker, owner, businessId, mine, paymentId } =
      await workerBusiness(t)
    const seen = await worker.query(api.payments.get, { businessId, paymentId })
    expect(seen.allocations.map((a) => a.jobId)).toEqual([mine.jobId])
    expect(seen.amountCents).toBe(4000)
    expect(seen.prepaidCents).toBe(0)
    const full = await owner.query(api.payments.get, { businessId, paymentId })
    expect(full.allocations).toHaveLength(2)
    expect(full.amountCents).toBe(15000)
  })

  it('sees Today only for their jobs, and no reminders', async () => {
    const t = setupConvex()
    const { worker, businessId, mine } = await workerBusiness(t)
    const today = await worker.query(api.today.list, {
      businessId,
      today: TODAY,
    })
    const jobIds = [
      ...today.appointments.map((a) => a.job?._id),
      ...today.upcoming.map((a) => a.job?._id),
      ...today.overdue.map((job) => job._id),
      ...today.dueSoon.map((job) => job._id),
      ...today.doneUnpaid.map((job) => job._id),
    ]
    expect(new Set(jobIds)).toEqual(new Set([mine.jobId]))
    expect(today.reminders).toEqual([])
  })

  it('sees only the clients of their jobs, without money', async () => {
    const t = setupConvex()
    const { worker, businessId, mine, theirs } = await workerBusiness(t)
    const clients = await worker.query(api.clients.list, { businessId })
    expect(clients.map((client) => client._id)).toEqual([mine.clientId])
    expect(clients[0].creditCents).toBe(0)
    expect(clients[0].owedCents).toBe(0)

    await expect(
      worker.query(api.clients.get, { businessId, clientId: theirs.clientId }),
    ).rejects.toThrow(/notFound/)
    const page = await worker.query(api.clients.get, {
      businessId,
      clientId: mine.clientId,
    })
    expect(page.jobs.map((job) => job._id)).toEqual([mine.jobId])
    expect(page.items.map((item) => item._id)).toEqual([mine.itemId])
    expect(page.client.creditCents).toBe(0)
    expect(page.owedCents).toBe(0)
    expect(page.payments).toEqual([])
    expect(page.reminders).toEqual([])
    expect(
      page.timeline.every(
        (event) => event.jobId === undefined || event.jobId === mine.jobId,
      ),
    ).toBe(true)
    expect(page.timeline.every((event) => event.jobId !== undefined)).toBe(true)
  })

  it('sees only the items of their jobs', async () => {
    const t = setupConvex()
    const { worker, businessId, mine, theirs } = await workerBusiness(t)
    await expect(
      worker.query(api.items.get, { businessId, itemId: theirs.itemId }),
    ).rejects.toThrow(/notFound/)
    const page = await worker.query(api.items.get, {
      businessId,
      itemId: mine.itemId,
    })
    expect(page.jobs.map((job) => job._id)).toEqual([mine.jobId])
    expect(page.reminders).toEqual([])
  })

  it('sees only the files of their jobs and items', async () => {
    const t = setupConvex()
    const { worker, businessId, mine, theirs } = await workerBusiness(t)
    await expect(
      worker.query(api.files.list, {
        businessId,
        target: { kind: 'job', jobId: theirs.jobId },
      }),
    ).rejects.toThrow(/notFound/)
    await expect(
      worker.query(api.files.list, {
        businessId,
        target: { kind: 'item', itemId: theirs.itemId },
      }),
    ).rejects.toThrow(/notFound/)
    await expect(
      worker.query(api.files.list, {
        businessId,
        target: { kind: 'client', clientId: mine.clientId },
      }),
    ).rejects.toThrow(/auth.forbidden/)
    expect(
      await worker.query(api.files.list, {
        businessId,
        target: { kind: 'job', jobId: mine.jobId },
      }),
    ).toEqual([])
  })

  it('finds only their own work in search', async () => {
    const t = setupConvex()
    const { worker, owner, businessId, mine } = await workerBusiness(t)
    const everyone = await owner.query(api.search.all, {
      businessId,
      query: 'поръчка',
    })
    expect(everyone.jobs).toHaveLength(2)
    const found = await worker.query(api.search.all, {
      businessId,
      query: 'поръчка',
    })
    expect(found.jobs.map((job) => job._id)).toEqual([mine.jobId])
    const clients = await worker.query(api.search.all, {
      businessId,
      query: 'клиент',
    })
    expect(clients.clients.map((client) => client._id)).toEqual([mine.clientId])
    const items = await worker.query(api.search.all, {
      businessId,
      query: 'item',
    })
    expect(items.items.map((item) => item._id)).toEqual([mine.itemId])
  })

  it('keeps only their own work offline', async () => {
    const t = setupConvex()
    const { worker, businessId, mine } = await workerBusiness(t)
    const snapshot = await worker.query(api.offline.snapshot, {
      businessId,
      today: TODAY,
    })
    expect(snapshot.jobs.map((job) => job._id)).toEqual([mine.jobId])
    expect(snapshot.appointments.map((a) => a.jobId)).toEqual([mine.jobId])
    expect(snapshot.clients.map((client) => client._id)).toEqual([
      mine.clientId,
    ])
  })

  it('reads nothing that only a manager can act on', async () => {
    const t = setupConvex()
    const { worker, businessId, mine } = await workerBusiness(t)
    await expect(
      worker.query(api.newJob.context, { businessId }),
    ).rejects.toThrow(/auth.forbidden/)
    await expect(
      worker.query(api.clientsAdmin.findByPhones, {
        businessId,
        phones: ['+359888123456'],
      }),
    ).rejects.toThrow(/auth.forbidden/)
    await expect(
      worker.query(api.items.byClient, { businessId, clientId: mine.clientId }),
    ).rejects.toThrow(/auth.forbidden/)
    await expect(
      worker.query(api.money.summary, { businessId, month: '2026-10' }),
    ).rejects.toThrow(/auth.forbidden/)
  })

  it('counts only their own work in the morning summary', async () => {
    const t = setupConvex()
    const { owner, businessId, membershipId, mine } = await workerBusiness(t)
    // Their overdue job with a visit today is shown under the visit, once.
    // This one is overdue with no visit, so it is counted as overdue.
    const lateId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: mine.clientId,
      title: 'Закъсняла',
      dueDate: '2026-10-02',
    })
    await t.run((ctx) =>
      ctx.db.patch('jobs', lateId, { assigneeIds: [membershipId] }),
    )
    const counts = await t.run(async (ctx) => {
      const { summaryCounts } = await import('./lib/summary')
      const business = (await ctx.db.get('businesses', businessId))!
      const member = (await ctx.db.get('memberships', membershipId))!
      return await summaryCounts(ctx, business, member, TODAY, {
        overdue: true,
        reminders: true,
      })
    })
    expect(counts).toEqual({ appointments: 1, overdue: 1, reminders: 0 })
  })
})
