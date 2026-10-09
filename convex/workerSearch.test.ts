// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
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
