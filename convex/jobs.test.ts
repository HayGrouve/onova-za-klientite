// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  expectCachesFresh,
  getDoc,
  lastActivity,
  setupBusiness,
  setupConvex,
  STRANGER,
} from './test.setup'

async function withClient() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Иван Петров',
    phones: [{ number: '0888 123 456' }],
    address: 'София, ул. Златовръх 12',
  })
  return { t, ...b, clientId }
}

describe('jobs', () => {
  it('a new job starts in the first New stage, with the client address copied (D3)', async () => {
    const { t, owner, businessId, clientId, stage } = await withClient()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
      typedPriceCents: 95000,
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.stageId).toBe(stage('new'))
    expect(job.stageGroup).toBe('new')
    expect(job.address).toBe('София, ул. Златовръх 12')
    expect(job.priceCents).toBe(95000)
    expect(job.balanceCents).toBe(95000)
    expect(job.owes).toBe(true)
    expect(job.searchText).toContain('ivan')
    expect((await lastActivity(t)).type).toBe('job.created')
    await expectCachesFresh(t)
  })

  it('two required fields are enough: client and title', async () => {
    const { t, owner, businessId, noClientId } = await withClient()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Ремонт на стол',
    })
    expect((await getDoc(t, 'jobs', jobId)).priceCents).toBe(0)
  })

  it('price is the sum of job lines; the typed price applies only without lines', async () => {
    const { t, owner, businessId, clientId } = await withClient()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Кухня',
      typedPriceCents: 100000,
    })
    await owner.mutation(api.jobs.setLines, {
      businessId,
      jobId,
      lines: [
        { id: 'a', description: 'Плот', quantity: 2.5, unitPriceCents: 12000 },
        { id: 'b', description: 'Монтаж', quantity: 1, unitPriceCents: 4000 },
      ],
    })
    expect((await getDoc(t, 'jobs', jobId)).priceCents).toBe(34000)
    expect((await lastActivity(t)).type).toBe('job.linesChanged')
    await owner.mutation(api.jobs.setLines, { businessId, jobId, lines: [] })
    expect((await getDoc(t, 'jobs', jobId)).priceCents).toBe(100000)
    await expectCachesFresh(t)
  })

  it('money is integer cents: a fractional amount is rejected', async () => {
    const { owner, businessId, clientId } = await withClient()
    await expect(
      owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title: 'Гардероб',
        typedPriceCents: 950.5,
      }),
    ).rejects.toThrow(/invalid/)
  })

  it('reaching Done records the done time; Cancelled never owes', async () => {
    const { t, owner, businessId, clientId, stage } = await withClient()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
      typedPriceCents: 95000,
    })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId,
      stageId: stage('done'),
    })
    const done = await getDoc(t, 'jobs', jobId)
    expect(done.doneAt).toBeDefined()
    expect(done.owes).toBe(true)
    expect((await lastActivity(t)).type).toBe('job.stageChanged')

    await owner.mutation(api.jobs.cancel, {
      businessId,
      jobId,
      reason: 'Отказа офертата',
    })
    const cancelled = await getDoc(t, 'jobs', jobId)
    expect(cancelled.stageGroup).toBe('cancelled')
    expect(cancelled.owes).toBe(false)
    expect(cancelled.cancelReason).toBe('Отказа офертата')
    expect((await lastActivity(t)).type).toBe('job.cancelled')
    await expectCachesFresh(t)
  })

  it('a write-off closes the unpaid rest: price = paid + balance + write-off', async () => {
    const { t, owner, businessId, clientId } = await withClient()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
      typedPriceCents: 95000,
    })
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId,
      amountCents: 90000,
      date: '2026-10-06',
      method: 'cash',
    })
    await owner.mutation(api.jobs.writeOff, {
      businessId,
      jobId,
      note: 'Отстъпка за забавяне',
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.writeOff?.amountCents).toBe(5000)
    expect(job.balanceCents).toBe(0)
    expect(job.owes).toBe(false)
    expect((await lastActivity(t)).type).toBe('job.writtenOff')

    await owner.mutation(api.jobs.removeWriteOff, { businessId, jobId })
    expect((await getDoc(t, 'jobs', jobId)).balanceCents).toBe(5000)
    await expectCachesFresh(t)
  })

  it("an item can only be linked to a job of the item's own client", async () => {
    const { owner, businessId, clientId } = await withClient()
    const otherId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId: otherId,
      name: 'Daikin, хол',
    })
    await expect(
      owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title: 'Профилактика',
        itemIds: [itemId],
      }),
    ).rejects.toThrow(/job.otherClient/)
  })

  it('an item added from a job is linked to that job, next to the ones it has', async () => {
    const { t, owner, businessId, clientId } = await withClient()
    const first = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Daikin, хол',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Профилактика',
      itemIds: [first],
    })
    const added = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Daikin, спалня',
      jobId,
    })
    expect((await getDoc(t, 'jobs', jobId)).itemIds).toEqual([first, added])
    const links = await t.run((ctx) =>
      ctx.db
        .query('jobItems')
        .withIndex('by_job', (q) => q.eq('jobId', jobId))
        .collect(),
    )
    expect(links.map((row) => row.itemId).sort()).toEqual([first, added].sort())
    const item = await owner.query(api.items.get, {
      businessId,
      itemId: added,
    })
    expect(item.jobs.map((job) => job._id)).toEqual([jobId])
  })

  it("an item can't be added to another client's job", async () => {
    const { t, owner, businessId, clientId } = await withClient()
    const otherId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: otherId,
      title: 'Профилактика',
    })
    await expect(
      owner.mutation(api.items.create, {
        businessId,
        clientId,
        name: 'Daikin, хол',
        jobId,
      }),
    ).rejects.toThrow(/job.otherClient/)
    // Nothing was saved: the failed call rolled back.
    const items = await t.run((ctx) => ctx.db.query('items').collect())
    expect(items).toEqual([])
  })

  it('item history survives a move to another client', async () => {
    const { t, owner, businessId, clientId } = await withClient()
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Golf 4',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Смяна на масло',
      itemIds: [itemId],
    })
    const buyerId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Купувач',
    })
    await owner.mutation(api.items.move, {
      businessId,
      itemId,
      toClientId: buyerId,
    })
    const history = await t.run((ctx) =>
      ctx.db
        .query('jobItems')
        .withIndex('by_item', (q) => q.eq('itemId', itemId))
        .collect(),
    )
    expect(history.map((row) => row.jobId)).toEqual([jobId])
    expect((await getDoc(t, 'items', itemId)).clientId).toBe(buyerId)
    expect((await lastActivity(t)).type).toBe('item.moved')
  })
})

describe('jobs after settings change', () => {
  it('cancelling still works after the last Cancelled stage was deleted', async () => {
    const { t, owner, businessId, clientId, stage } = await withClient()
    await owner.mutation(api.stages.remove, {
      businessId,
      stageId: stage('cancelled'),
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Шкаф',
    })
    await owner.mutation(api.jobs.cancel, { businessId, jobId })
    expect((await getDoc(t, 'jobs', jobId)).stageGroup).toBe('cancelled')
  })

  it('a moved item stays linkable to the jobs it already had', async () => {
    const { owner, businessId, clientId } = await withClient()
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Golf 4',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Масло',
      itemIds: [itemId],
    })
    const buyerId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Купувач',
    })
    await owner.mutation(api.items.move, {
      businessId,
      itemId,
      toClientId: buyerId,
    })
    await owner.mutation(api.jobs.setItems, {
      businessId,
      jobId,
      itemIds: [itemId],
    })
  })

  it('"No client" owns no items', async () => {
    const { owner, businessId, noClientId } = await withClient()
    await expect(
      owner.mutation(api.items.create, {
        businessId,
        clientId: noClientId,
        name: 'Стол',
      }),
    ).rejects.toThrow(/client.noClient/)
  })
})

describe('jobs board', () => {
  it('has one column per stage group, in board order, with every stage to drop on', async () => {
    const { owner, businessId, clientId, stage, stages } = await withClient()
    const create = (title: string, dueDate?: string) =>
      owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title,
        dueDate,
        typedPriceCents: 10000,
      })
    await create('Без срок')
    await create('Късен срок', '2026-12-01')
    await create('Ранен срок', '2026-11-01')
    const doneId = await create('Готов')
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: doneId,
      stageId: stage('done'),
    })

    const board = await owner.query(api.jobs.board, { businessId })
    expect(board.columns.map((column) => column.group)).toEqual([
      'new',
      'in_progress',
      'done',
      'cancelled',
    ])
    const [open, , done] = board.columns
    expect(open.jobs.map((job) => job.title)).toEqual([
      'Ранен срок',
      'Късен срок',
      'Без срок',
    ])
    expect(open.total).toBe(3)
    expect(open.owedCents).toBe(30000)
    expect(done.jobs.map((job) => job.title)).toEqual(['Готов'])
    expect(board.stages.map((item) => item._id)).toEqual(
      stages.map((item) => item._id),
    )
  })

  it('a long Done history still shows the most recently finished', async () => {
    const { t, owner, businessId, clientId, stage } = await withClient()
    const done = async (title: string, dueDate: string) => {
      const jobId = await owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title,
        dueDate,
        typedPriceCents: 1000,
      })
      await owner.mutation(api.jobs.changeStage, {
        businessId,
        jobId,
        stageId: stage('done'),
      })
      return jobId
    }
    // More old Done jobs than one read takes, all due before the newest one.
    const oldId = await done('Стар', '2020-01-01')
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...old } = (await ctx.db.get('jobs', oldId))!
      for (let index = 0; index < 510; index++) {
        await ctx.db.insert('jobs', { ...old, doneAt: (old.doneAt ?? 0) - 1 })
      }
    })
    await done('Най-нов', '2030-01-01')

    const board = await owner.query(api.jobs.board, { businessId })
    const column = board.columns.find((item) => item.group === 'done')!
    expect(column.jobs).toHaveLength(20)
    expect(column.jobs[0].title).toBe('Най-нов')
    expect(column.owedCents).toBe(512 * 1000)
  })

  it('shows another business nothing', async () => {
    const { t, businessId } = await withClient()
    const stranger = t.withIdentity(STRANGER)
    await stranger.mutation(api.users.ensureCurrent, {})
    await expect(
      stranger.query(api.jobs.board, { businessId }),
    ).rejects.toThrow()
  })
})
