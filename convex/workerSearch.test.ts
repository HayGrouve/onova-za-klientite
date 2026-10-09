// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { WORKER_RECENT, workerRecentAssignments } from './lib/scope'
import {
  addMember,
  assignJob,
  jobIndexProblems,
  setupBusiness,
  setupConvex,
} from './test.setup'
import type { TestConvex } from './test.setup'

async function setup() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const { member: worker, membershipId } = await addMember(t, b, 'worker')
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Петър Димитров',
  })
  return { t, ...b, worker, membershipId, clientId }
}

/** The assignment rows of a job, as stored. */
const rowsOf = (t: TestConvex, jobId: Id<'jobs'>) =>
  t.run((ctx) =>
    ctx.db
      .query('jobAssignments')
      .withIndex('by_job', (q) => q.eq('jobId', jobId))
      .collect(),
  )

const settle = async (t: TestConvex) => {
  for (let round = 0; round < 6; round++) {
    await t.finishAllScheduledFunctions(() => {})
  }
}

describe('a Worker’s search (D109)', () => {
  it('finds their job when more than 64 others in the business match it', async () => {
    const { t, owner, worker, businessId, membershipId, clientId } =
      await setup()
    // 70 other jobs, all made first and all matching the query as well.
    for (let index = 0; index < 70; index++) {
      await owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title: `Ремонт ${index}`,
      })
    }
    const mine = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Ремонт на моя',
    })
    await assignJob(t, mine, [membershipId])

    const everyone = await owner.query(api.search.all, {
      businessId,
      query: 'ремонт',
    })
    expect(everyone.jobs.length).toBeGreaterThan(0)
    const found = await worker.query(api.search.all, {
      businessId,
      query: 'ремонт',
    })
    expect(found.jobs.map((job) => job._id)).toEqual([mine])
  })

  it('finds their client by name when more than 64 other clients match', async () => {
    const { t, owner, worker, businessId, membershipId } = await setup()
    for (let index = 0; index < 70; index++) {
      await owner.mutation(api.clients.create, {
        businessId,
        name: `Иван Номер${index}`,
      })
    }
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван Последен',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Работа',
    })
    await assignJob(t, jobId, [membershipId])
    const found = await worker.query(api.search.all, {
      businessId,
      query: 'иван',
    })
    expect(found.clients.map((client) => client._id)).toEqual([clientId])
  })

  it('finds their item when more than 64 other items match', async () => {
    const { t, owner, worker, businessId, membershipId, clientId } =
      await setup()
    await owner.mutation(api.businesses.setModules, {
      businessId,
      modules: {
        items: true,
        appointments: false,
        costs: false,
        reminders: false,
        services: false,
      },
    })
    for (let index = 0; index < 70; index++) {
      await owner.mutation(api.items.create, {
        businessId,
        clientId,
        name: `Перално ${index}`,
      })
    }
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Перално на Петър',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Ремонт',
    })
    await owner.mutation(api.jobs.setItems, {
      businessId,
      jobId,
      itemIds: [itemId],
    })
    await assignJob(t, jobId, [membershipId])
    const found = await worker.query(api.search.all, {
      businessId,
      query: 'перално',
    })
    expect(found.items.map((item) => item._id)).toEqual([itemId])
    // An item of a job that is not theirs stays hidden.
    const stranger = await owner.query(api.search.all, {
      businessId,
      query: 'перално',
    })
    expect(stranger.items.length).toBeGreaterThan(1)
  })

  it('finds their client by the end of the phone when more than 64 other clients match', async () => {
    const { t, owner, worker, businessId, membershipId } = await setup()
    for (let index = 0; index < 70; index++) {
      await owner.mutation(api.clients.create, {
        businessId,
        name: `Друг ${index}`,
        phones: [{ number: `+359 88${String(index).padStart(3, '0')}4159` }],
      })
    }
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мой клиент',
      phones: [{ number: '+359 887 654 159' }],
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Работа',
    })
    await assignJob(t, jobId, [membershipId])
    const found = await worker.query(api.search.all, {
      businessId,
      query: '4159',
    })
    expect(found.clients.map((client) => client._id)).toEqual([clientId])
  })

  it('finds their client by address, and by whole words but the last', async () => {
    const { t, owner, worker, businessId, membershipId } = await setup()
    for (let index = 0; index < 70; index++) {
      await owner.mutation(api.clients.create, {
        businessId,
        name: `Друг ${index}`,
        address: 'ул. Липа 5',
      })
    }
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мой клиент',
      address: 'ул. Липа 5',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Работа',
    })
    await assignJob(t, jobId, [membershipId])
    const search = async (query: string) =>
      (await worker.query(api.search.all, { businessId, query })).clients.map(
        (client) => client._id,
      )
    expect(await search('липа')).toEqual([clientId])
    // A part of the first word is no match, as in the index.
    expect(await search('ли 5')).toEqual([])
  })

  it('reads a bounded number of a Worker’s assignment rows, newest groups first', async () => {
    const { t, owner, membershipId, businessId, clientId } = await setup()
    const open = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Отворена',
    })
    await assignJob(t, open, [membershipId])
    const [base] = await rowsOf(t, open)
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = base
      for (let index = 0; index < WORKER_RECENT * 2; index++) {
        await ctx.db.insert('jobAssignments', {
          ...fields,
          stageGroup: 'done',
          dueDate: `2030-01-${String((index % 28) + 1).padStart(2, '0')}`,
        })
      }
    })
    const rows = await t.run(async (ctx) => {
      const member = (await ctx.db.get('memberships', membershipId))!
      const business = (await ctx.db.get('businesses', businessId))!
      return await workerRecentAssignments({ ...ctx, member, business })
    })
    expect(rows).toHaveLength(WORKER_RECENT)
    // The open job's row comes before any Done one.
    expect(rows[0].jobId).toBe(open)
    expect(rows[0].stageGroup).not.toBe('done')
  }, 30_000)

  it('reads only their most recent rows: a recent item is found, one on an old Done job is not', async () => {
    const { t, owner, worker, businessId, membershipId, clientId } =
      await setup()
    await owner.mutation(api.businesses.setModules, {
      businessId,
      modules: {
        items: true,
        appointments: false,
        costs: false,
        reminders: false,
        services: false,
      },
    })
    // Others made first fill the index's first 64 hits.
    for (let index = 0; index < 70; index++) {
      await owner.mutation(api.items.create, {
        businessId,
        clientId,
        name: `Ковер ${index}`,
      })
    }
    const itemOn = async (name: string) => {
      const itemId = await owner.mutation(api.items.create, {
        businessId,
        clientId,
        name,
      })
      const jobId = await owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title: name,
      })
      await owner.mutation(api.jobs.setItems, {
        businessId,
        jobId,
        itemIds: [itemId],
      })
      await assignJob(t, jobId, [membershipId])
      return { itemId, jobId }
    }
    const old = await itemOn('Ковер стар')
    const recent = await itemOn('Ковер скорошен')
    // The old job went Done long ago, behind many newer Done rows.
    await t.run(async (ctx) => {
      const [oldRow] = await ctx.db
        .query('jobAssignments')
        .withIndex('by_job', (q) => q.eq('jobId', old.jobId))
        .collect()
      await ctx.db.patch('jobAssignments', oldRow._id, {
        stageGroup: 'done',
        dueDate: '2000-01-01',
      })
      const { _id, _creationTime, ...fields } = oldRow
      for (let index = 0; index < WORKER_RECENT; index++) {
        await ctx.db.insert('jobAssignments', {
          ...fields,
          jobId: recent.jobId,
          stageGroup: 'done',
          dueDate: `2030-01-${String((index % 28) + 1).padStart(2, '0')}`,
        })
      }
    })
    const found = await worker.query(api.search.all, {
      businessId,
      query: 'ковер',
    })
    const ids = found.items.map((item) => item._id)
    expect(ids).toContain(recent.itemId)
    expect(ids).not.toContain(old.itemId)
  }, 60_000)

  it('does not find a job that is not theirs, nor one taken off them', async () => {
    const { t, owner, worker, businessId, membershipId, clientId } =
      await setup()
    const other = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Ремонт чужд',
    })
    const mine = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Ремонт мой',
    })
    await assignJob(t, mine, [membershipId])
    const search = async () =>
      (
        await worker.query(api.search.all, { businessId, query: 'ремонт' })
      ).jobs.map((job) => job._id)
    expect(await search()).toEqual([mine])
    await assignJob(t, mine, [])
    expect(await search()).toEqual([])
    expect(other).not.toBe(mine)
  })

  it('keeps the rows’ search text with the job through a rename, a client rename and a merge', async () => {
    const { t, owner, worker, businessId, membershipId, clientId } =
      await setup()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
    })
    await assignJob(t, jobId, [membershipId])
    const same = async () => {
      const job = await t.run((ctx) => ctx.db.get('jobs', jobId))
      const rows = await rowsOf(t, jobId)
      expect(rows).toHaveLength(1)
      expect(rows[0].searchText).toBe(job!.searchText)
      return job!.searchText
    }
    expect(await same()).toContain('garderob')

    await owner.mutation(api.jobs.update, {
      businessId,
      jobId,
      title: 'Шкаф',
    })
    const renamed = await same()
    expect(renamed).toContain('shkaf')
    expect(renamed).not.toContain('garderob')
    const byTitle = await worker.query(api.search.all, {
      businessId,
      query: 'шкаф',
    })
    expect(byTitle.jobs.map((job) => job._id)).toEqual([jobId])

    // A client's name is part of its jobs' keys.
    await owner.mutation(api.clients.update, {
      businessId,
      clientId,
      name: 'Стоян Георгиев',
    })
    const withClient = await same()
    expect(withClient).toContain('stoian')
    expect(withClient).not.toContain('petar')
    const byClient = await worker.query(api.search.all, {
      businessId,
      query: 'стоян',
    })
    expect(byClient.jobs.map((job) => job._id)).toEqual([jobId])
    const old = await worker.query(api.search.all, {
      businessId,
      query: 'петър',
    })
    expect(old.jobs).toEqual([])

    // A merge moves the job to the other client, and its keys with it.
    const into = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Калоян Тодоров',
    })
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: clientId,
      intoId: into,
    })
    expect(await same()).toContain('kaloian')
    expect(await jobIndexProblems(t)).toEqual([])
  })

  it('follows search:rebuildAll', async () => {
    const { t, owner, businessId, membershipId, clientId } = await setup()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
    })
    await assignJob(t, jobId, [membershipId])
    const good = (await rowsOf(t, jobId))[0].searchText
    await t.run(async (ctx) => {
      await ctx.db.patch('jobs', jobId, { searchText: 'stale' })
    })
    await t.mutation(internal.search.rebuildAll, {})
    await settle(t)
    expect((await rowsOf(t, jobId))[0].searchText).toBe(good)
    expect(await jobIndexProblems(t)).toEqual([])
  })
})

describe('the assignment rows’ search text on existing data', () => {
  async function withRows() {
    const s = await setup()
    const { t, owner, businessId, membershipId, clientId } = s
    const jobs: Array<Id<'jobs'>> = []
    for (const title of ['Гардероб', 'Маса', 'Легло']) {
      const jobId = await owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title,
      })
      await assignJob(t, jobId, [membershipId])
      jobs.push(jobId)
    }
    return { ...s, jobs }
  }

  const clearRows = (t: TestConvex, text?: string) =>
    t.run(async (ctx) => {
      for (const row of await ctx.db.query('jobAssignments').collect()) {
        await ctx.db.patch('jobAssignments', row._id, { searchText: text })
      }
    })

  it('counts:backfill fills rows made without it, and mends a row whose other fields match', async () => {
    const { t, jobs } = await withRows()
    await clearRows(t)
    expect(await jobIndexProblems(t)).not.toEqual([])
    await t.mutation(internal.counts.backfill, {})
    await settle(t)
    expect(await jobIndexProblems(t)).toEqual([])

    // Same group, due date, client and owes, but a different text.
    await clearRows(t, 'stale')
    await t.mutation(internal.counts.backfill, {})
    await settle(t)
    expect(await jobIndexProblems(t)).toEqual([])
    for (const jobId of jobs) {
      const job = await t.run((ctx) => ctx.db.get('jobs', jobId))
      expect((await rowsOf(t, jobId))[0].searchText).toBe(job!.searchText)
    }
  })

  it('counts:fillAssignmentSearch fills a business the deploy backfill skips, and then changes nothing', async () => {
    const { t, worker, businessId } = await withRows()
    await clearRows(t)
    // The business is built, so `onlyMissing` leaves it alone.
    await t.mutation(internal.counts.backfill, { onlyMissing: true })
    await settle(t)
    expect(await jobIndexProblems(t)).not.toEqual([])
    await t.mutation(internal.counts.fillAssignmentSearch, {})
    await settle(t)
    expect(await jobIndexProblems(t)).toEqual([])
    const after = await worker.query(api.search.all, {
      businessId,
      query: 'гардероб',
    })
    expect(after.jobs).toHaveLength(1)

    const snapshot = () =>
      t.run((ctx) => ctx.db.query('jobAssignments').collect())
    const first = await snapshot()
    await t.mutation(internal.counts.fillAssignmentSearch, {})
    await settle(t)
    expect(await snapshot()).toEqual(first)
  })

  it('counts:fillAssignmentSearch goes through more than one page', async () => {
    const { t, owner, businessId, membershipId, clientId } = await setup()
    const first = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
    })
    await assignJob(t, first, [membershipId])
    const { _id, _creationTime, ...fields } = (await rowsOf(t, first))[0]
    await t.run(async (ctx) => {
      for (let index = 0; index < 520; index++) {
        await ctx.db.insert('jobAssignments', {
          ...fields,
          searchText: undefined,
        })
      }
    })
    await t.mutation(internal.counts.fillAssignmentSearch, {})
    await settle(t)
    const rows = await t.run((ctx) => ctx.db.query('jobAssignments').collect())
    expect(rows).toHaveLength(521)
    expect(rows.every((row) => row.searchText !== undefined)).toBe(true)
  }, 30_000)
})
