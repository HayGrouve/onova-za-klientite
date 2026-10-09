// @vitest-environment edge-runtime
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { STAGE_GROUPS } from '../shared/stages'
import type { StageGroup } from '../shared/stages'
import { rebuildPage, startRebuild } from './lib/ledger'
import {
  addMember,
  assignJob,
  expectCachesFresh,
  jobIndexProblems,
  setupBusiness,
  setupConvex,
} from './test.setup'
import type { TestConvex } from './test.setup'

const DATE = '2026-10-06'

/** What the jobs say: a group and a stage tally, to set against the counters. */
async function recount(t: TestConvex, businessId: Id<'businesses'>) {
  return await t.run(async (ctx) => {
    const jobs = (await ctx.db.query('jobs').collect()).filter(
      (job) => job.businessId === businessId,
    )
    const groups = { new: 0, in_progress: 0, done: 0, cancelled: 0 }
    const stages: Record<string, number> = {}
    for (const job of jobs) {
      groups[job.stageGroup]++
      stages[job.stageId] = (stages[job.stageId] ?? 0) + 1
    }
    return { groups, stages }
  })
}

async function setup() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clients = [
    await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Първи клиент',
    }),
    await b.owner.mutation(api.clients.create, {
      businessId: b.businessId,
      name: 'Втори клиент',
    }),
  ]
  const { member: worker, membershipId: workerId } = await addMember(
    t,
    b,
    'worker',
  )
  return { t, ...b, clients, worker, workerId }
}

type Step =
  | { kind: 'create'; client: number; stage: number }
  | { kind: 'move'; job: number; stage: number }
  | { kind: 'cancel'; job: number }
  | { kind: 'addStage'; group: StageGroup }
  | { kind: 'regroup'; stage: number; group: StageGroup }
  | { kind: 'removeStage'; stage: number; into: number }
  | { kind: 'assign'; job: number; workers: boolean; owner: boolean }
  | { kind: 'pay'; job: number }
  | { kind: 'merge' }

const group = fc.constantFrom(...STAGE_GROUPS)

const stepArb = fc.oneof(
  fc.record({
    kind: fc.constant('create' as const),
    client: fc.nat(1),
    stage: fc.nat(8),
  }),
  fc.record({
    kind: fc.constant('move' as const),
    job: fc.nat(9),
    stage: fc.nat(8),
  }),
  fc.record({ kind: fc.constant('cancel' as const), job: fc.nat(9) }),
  fc.record({ kind: fc.constant('addStage' as const), group }),
  fc.record({
    kind: fc.constant('regroup' as const),
    stage: fc.nat(8),
    group,
  }),
  fc.record({
    kind: fc.constant('removeStage' as const),
    stage: fc.nat(8),
    into: fc.nat(8),
  }),
  fc.record({
    kind: fc.constant('assign' as const),
    job: fc.nat(9),
    workers: fc.boolean(),
    owner: fc.boolean(),
  }),
  fc.record({ kind: fc.constant('pay' as const), job: fc.nat(9) }),
  fc.constant({ kind: 'merge' as const }),
) as fc.Arbitrary<Step>

/** A business to run steps on, with the jobs they have made so far. */
async function stepper() {
  const { t, owner, businessId, clients, workerId } = await setup()
  const ownerMemberId = await t.run(
    async (ctx) =>
      (await ctx.db.query('memberships').collect()).find(
        (member) => member.role === 'owner',
      )!._id,
  )
  const jobs: Array<Id<'jobs'>> = []
  const stageIds = async () =>
    (
      await t.run((ctx) =>
        ctx.db
          .query('stages')
          .withIndex('by_business_order', (q) => q.eq('businessId', businessId))
          .collect(),
      )
    ).map((item) => item._id)
  // A step that the app refuses changes nothing, as in a real call.
  const attempt = async (run: () => Promise<unknown>) => {
    try {
      await run()
    } catch {
      // refused
    }
  }
  const apply = async (step: Step) => {
    const stages = await stageIds()
    const pick = (index: number) => stages[index % stages.length]
    const job = (index: number) =>
      jobs.length > 0 ? jobs[index % jobs.length] : undefined
    if (step.kind === 'create') {
      await attempt(async () =>
        jobs.push(
          await owner.mutation(api.jobs.create, {
            businessId,
            clientId: clients[step.client],
            title: `Работа ${jobs.length}`,
            stageId: pick(step.stage),
            typedPriceCents: 5000,
          }),
        ),
      )
    } else if (step.kind === 'move' && job(step.job)) {
      await attempt(() =>
        owner.mutation(api.jobs.changeStage, {
          businessId,
          jobId: job(step.job)!,
          stageId: pick(step.stage),
        }),
      )
    } else if (step.kind === 'cancel' && job(step.job)) {
      await attempt(() =>
        owner.mutation(api.jobs.cancel, { businessId, jobId: job(step.job)! }),
      )
    } else if (step.kind === 'addStage') {
      await attempt(() =>
        owner.mutation(api.stages.add, {
          businessId,
          name: 'Етап',
          group: step.group,
        }),
      )
    } else if (step.kind === 'regroup') {
      await attempt(() =>
        owner.mutation(api.stages.update, {
          businessId,
          stageId: pick(step.stage),
          group: step.group,
        }),
      )
    } else if (step.kind === 'removeStage') {
      await attempt(() =>
        owner.mutation(api.stages.remove, {
          businessId,
          stageId: pick(step.stage),
          moveJobsTo: pick(step.into),
        }),
      )
    } else if (step.kind === 'assign' && job(step.job)) {
      await attempt(() =>
        assignJob(t, job(step.job)!, [
          ...(step.workers ? [workerId] : []),
          ...(step.owner ? [ownerMemberId] : []),
        ]),
      )
    } else if (step.kind === 'pay' && job(step.job)) {
      await attempt(() =>
        owner.mutation(api.payments.addFromJob, {
          businessId,
          jobId: job(step.job)!,
          amountCents: 5000,
          date: DATE,
          method: 'cash',
        }),
      )
    } else if (step.kind === 'merge') {
      await attempt(() =>
        owner.mutation(api.clientsAdmin.merge, {
          businessId,
          fromId: clients[0],
          intoId: clients[1],
        }),
      )
    }
  }
  return { t, owner, businessId, clients, workerId, jobs, apply }
}

describe('job counts and assignments follow the jobs (D105, D106)', () => {
  it('a new job counts in its group and its stage', async () => {
    const { t, owner, businessId, clients, stage } = await setup()
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Гардероб',
    })
    const list = await owner.query(api.jobs.list, { businessId })
    expect(list.counts).toEqual({
      new: 1,
      in_progress: 0,
      done: 0,
      cancelled: 0,
    })
    const stages = await owner.query(api.businesses.stageJobCounts, {
      businessId,
    })
    expect(stages.find((item) => item.stageId === stage('new'))?.jobCount).toBe(
      1,
    )
    await expectCachesFresh(t)
  })

  it('stay equal to a recount after any run of creates, moves, cancels, regroups, stage removals, assignments, payments and merges', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { maxLength: 14 }), async (steps) => {
        const { t, owner, businessId, apply } = await stepper()
        for (const step of steps) await apply(step)
        expect(await jobIndexProblems(t)).toEqual([])
        // What the screens show is the recount too.
        const found = await recount(t, businessId)
        const list = await owner.query(api.jobs.list, { businessId })
        expect(list.counts).toEqual(found.groups)
        const board = await owner.query(api.jobs.board, { businessId })
        expect(board.columns.map((column) => column.total)).toEqual(
          STAGE_GROUPS.map((key) => found.groups[key]),
        )
        const perStage = await owner.query(api.businesses.stageJobCounts, {
          businessId,
        })
        for (const item of perStage) {
          expect(item.jobCount).toBe(found.stages[item.stageId] ?? 0)
        }
        await expectCachesFresh(t)
      }),
      { numRuns: 25 },
    )
  })

  it("a Worker's counts and rows are their own jobs only", async () => {
    const { t, owner, worker, businessId, clients, workerId, stage } =
      await setup()
    const make = (title: string, stageId?: Id<'stages'>) =>
      owner.mutation(api.jobs.create, {
        businessId,
        clientId: clients[0],
        title,
        stageId,
      })
    const mine = await make('Моя')
    const doneMine = await make('Моя готова', stage('done'))
    await make('Чужда')
    await assignJob(t, mine, [workerId])
    await assignJob(t, doneMine, [workerId])
    const list = await worker.query(api.jobs.list, { businessId })
    expect(list.counts).toEqual({
      new: 1,
      in_progress: 0,
      done: 1,
      cancelled: 0,
    })
    expect(list.jobs.map((job) => job._id).sort()).toEqual(
      [mine, doneMine].sort(),
    )
    const board = await worker.query(api.jobs.board, { businessId })
    expect(board.columns.map((column) => column.total)).toEqual([1, 0, 1, 0])
    // Moving a job moves it between the Worker's counts; taking it back removes it.
    await owner.mutation(api.jobs.cancel, { businessId, jobId: mine })
    expect(
      (await worker.query(api.jobs.list, { businessId })).counts,
    ).toMatchObject({ new: 0, cancelled: 1, done: 1 })
    await assignJob(t, doneMine, [])
    expect(
      (await worker.query(api.jobs.list, { businessId })).counts,
    ).toMatchObject({ done: 0, cancelled: 1 })
    await expectCachesFresh(t)
  })
})

describe("a Worker's done-but-unpaid jobs", () => {
  it('follow the payments that settle them', async () => {
    const { t, owner, worker, businessId, clients, workerId, stage } =
      await setup()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Готова',
      stageId: stage('done'),
      typedPriceCents: 8000,
    })
    await assignJob(t, jobId, [workerId])
    const owing = async () =>
      (
        await worker.query(api.today.list, {
          businessId,
          today: DATE,
        })
      ).doneUnpaid.map((job) => job._id)
    expect(await owing()).toEqual([jobId])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId,
      amountCents: 8000,
      date: DATE,
      method: 'cash',
    })
    expect(await owing()).toEqual([])
    await expectCachesFresh(t)
  })
})

/** The counts and rows a business had before they shipped: none. */
async function wipe(t: TestConvex) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query('jobCounts').collect()) {
      await ctx.db.delete('jobCounts', row._id)
    }
    for (const row of await ctx.db.query('jobAssignments').collect()) {
      await ctx.db.delete('jobAssignments', row._id)
    }
  })
}

const backfill = async (t: TestConvex) => {
  await t.mutation(internal.counts.backfill, {})
  for (let round = 0; round < 6; round++) {
    await t.finishAllScheduledFunctions(() => {})
  }
}

describe('the backfill', () => {
  it('rebuilds every counter and assignment of a seeded business, and a second run changes nothing', async () => {
    vi.stubEnv('ALLOW_SEED', 'true')
    const t = setupConvex()
    await t.mutation(internal.seed.dev, {})
    const members = await t.run((ctx) => ctx.db.query('memberships').collect())
    const jobs = await t.run((ctx) => ctx.db.query('jobs').collect())
    expect(jobs.length).toBeGreaterThan(3)
    // Some jobs with assignees, then everything derived is lost.
    await assignJob(t, jobs[0]._id, [members[0]._id])
    await assignJob(t, jobs[1]._id, [members[0]._id, members[1]._id])
    expect(await jobIndexProblems(t)).toEqual([])
    await wipe(t)
    expect((await jobIndexProblems(t)).length).toBeGreaterThan(0)
    // A row for a job that is gone, and one for a member who was taken off.
    await t.run(async (ctx) => {
      await ctx.db.insert('jobAssignments', {
        businessId: jobs[2].businessId,
        jobId: jobs[2]._id,
        membershipId: members[0]._id,
        clientId: jobs[2].clientId,
        stageGroup: jobs[2].stageGroup,
        owes: false,
      })
    })

    await backfill(t)
    expect(await jobIndexProblems(t)).toEqual([])

    const snapshot = () =>
      t.run(async (ctx) => [
        await ctx.db.query('jobCounts').collect(),
        await ctx.db.query('jobAssignments').collect(),
      ])
    const first = await snapshot()
    await backfill(t)
    expect(await snapshot()).toEqual(first)
    expect(await jobIndexProblems(t)).toEqual([])
  })

  it('counts a business larger than one page, and mends a wrong counter', async () => {
    const { t, owner, businessId, clients } = await setup()
    const first = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Първа',
    })
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...job } = (await ctx.db.get('jobs', first))!
      for (let index = 0; index < 520; index++) {
        await ctx.db.insert('jobs', job)
      }
    })
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      1,
    )
    await backfill(t)
    expect(await jobIndexProblems(t)).toEqual([])
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      521,
    )
    // A counter that drifted is put right.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query('jobCounts').first())!
      await ctx.db.patch('jobCounts', row._id, {
        groups: { new: 3, in_progress: 9, done: 0, cancelled: 0 },
      })
    })
    await backfill(t)
    expect(await jobIndexProblems(t)).toEqual([])
  })

  it('seeding again clears the old counts with the old jobs', async () => {
    vi.stubEnv('ALLOW_SEED', 'true')
    const t = setupConvex()
    await t.mutation(internal.seed.dev, {})
    await t.mutation(internal.seed.dev, {})
    expect(await jobIndexProblems(t)).toEqual([])
  })
})

describe('the deploy-time backfill (onlyMissing)', () => {
  it('builds a business with no counts and leaves a built one unread', async () => {
    const { t, owner, businessId, clients } = await setup()
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Една',
    })
    // Built: a wrong counter stays as it is, since the run doesn't look at it.
    const row = await t.run((ctx) =>
      ctx.db
        .query('jobCounts')
        .withIndex('by_business_member', (q) =>
          q.eq('businessId', businessId).eq('membershipId', undefined),
        )
        .unique(),
    )
    await t.run((ctx) =>
      ctx.db.patch('jobCounts', row!._id, {
        groups: { ...row!.groups, new: 99 },
      }),
    )
    await t.mutation(internal.counts.backfill, { onlyMissing: true })
    await t.finishAllScheduledFunctions(() => {})
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      99,
    )

    // Not built: the run builds it.
    await wipe(t)
    await t.mutation(internal.counts.backfill, { onlyMissing: true })
    for (let round = 0; round < 6; round++) {
      await t.finishAllScheduledFunctions(() => {})
    }
    expect(await jobIndexProblems(t)).toEqual([])
  })
})

describe('an abandoned recount', () => {
  it('is dropped by the next job change instead of taxing every write', async () => {
    const { t, owner, businessId, clients } = await setup()
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Една',
    })
    await t.run((ctx) =>
      ctx.db.insert('jobCountRebuilds', {
        businessId,
        runId: 'lost',
        after: Number.MAX_SAFE_INTEGER,
        groups: { new: 0, in_progress: 0, done: 0, cancelled: 0 },
        stages: {},
        members: {},
      }),
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000)
    const working = await t.run(async (ctx) =>
      (await ctx.db.query('stages').collect()).find(
        (stage) =>
          stage.businessId === businessId && stage.group === 'in_progress',
      ),
    )
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId,
      stageId: working!._id,
    })
    vi.useRealTimers()
    const rows = await t.run((ctx) =>
      ctx.db.query('jobCountRebuilds').collect(),
    )
    expect(rows).toEqual([])
    expect(await jobIndexProblems(t)).toEqual([])
  })
})

describe('counts that are not built yet', () => {
  /** A business with three jobs, one of them a Worker's, and nothing derived. */
  async function unbuilt() {
    const env = await setup()
    const { t, owner, businessId, clients, workerId } = env
    const make = (title: string) =>
      owner.mutation(api.jobs.create, {
        businessId,
        clientId: clients[0],
        title,
      })
    await make('Една')
    await make('Две')
    await assignJob(t, await make('Три'), [workerId])
    await wipe(t)
    return env
  }

  it('read as a recount of the jobs, not as an empty business', async () => {
    const { owner, worker, businessId } = await unbuilt()
    const list = await owner.query(api.jobs.list, { businessId })
    expect(list.counts).toEqual({
      new: 3,
      in_progress: 0,
      done: 0,
      cancelled: 0,
    })
    const board = await owner.query(api.jobs.board, { businessId })
    expect(board.columns.map((column) => column.total)).toEqual([3, 0, 0, 0])
    const stages = await owner.query(api.businesses.stageJobCounts, {
      businessId,
    })
    expect(stages.reduce((sum, item) => sum + item.jobCount, 0)).toBe(3)
    expect((await worker.query(api.jobs.list, { businessId })).counts.new).toBe(
      1,
    )
  })

  it("a change doesn't turn them into a row that counts only that change", async () => {
    const { t, owner, businessId, clients } = await unbuilt()
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Четвърта',
    })
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      4,
    )
    expect(await t.run((ctx) => ctx.db.query('jobCounts').collect())).toEqual(
      [],
    )
    await backfill(t)
    expect(await jobIndexProblems(t)).toEqual([])
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      4,
    )
  })

  it('start with the first job of a business', async () => {
    const { t, owner, businessId, clients } = await setup()
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      0,
    )
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: clients[0],
      title: 'Първа',
    })
    expect(
      await t.run((ctx) => ctx.db.query('jobCounts').collect()),
    ).toHaveLength(1)
    expect(await jobIndexProblems(t)).toEqual([])
  })
})

describe('the backfill while the app is in use', () => {
  /** Rebuilds a business `size` jobs at a time, with `between` run after each page. */
  async function rebuild(
    t: TestConvex,
    businessId: Id<'businesses'>,
    size: number,
    between: (page: number) => Promise<void>,
  ) {
    const runId = (await t.run((ctx) => startRebuild(ctx, businessId)))!
    for (let page = 0; ; page++) {
      const state = await t.run((ctx) =>
        rebuildPage(ctx, businessId, runId, size),
      )
      if (state !== 'more') return state
      await between(page)
    }
  }

  const createJobs = async (
    env: Awaited<ReturnType<typeof setup>>,
    count: number,
  ) => {
    const ids: Array<Id<'jobs'>> = []
    for (let index = 0; index < count; index++) {
      ids.push(
        await env.owner.mutation(api.jobs.create, {
          businessId: env.businessId,
          clientId: env.clients[0],
          title: `Работа ${index}`,
        }),
      )
    }
    return ids
  }

  it('keeps a job changed after its page was counted', async () => {
    const env = await setup()
    const { t, owner, businessId } = env
    const [first, , , last] = await createJobs(env, 4)
    await wipe(t)
    const state = await rebuild(t, businessId, 2, async () => {
      // The first page is counted; these jobs are behind and ahead of it.
      await owner.mutation(api.jobs.cancel, { businessId, jobId: first })
      await owner.mutation(api.jobs.cancel, { businessId, jobId: last })
    })
    expect(state).toBe('done')
    expect(await jobIndexProblems(t)).toEqual([])
    expect((await owner.query(api.jobs.list, { businessId })).counts).toEqual({
      new: 2,
      in_progress: 0,
      done: 0,
      cancelled: 2,
    })
  })

  it('counts a job made while it runs once, and a Worker taken off one', async () => {
    const env = await setup()
    const { t, owner, businessId, workerId } = env
    const [first] = await createJobs(env, 3)
    await assignJob(t, first, [workerId])
    await wipe(t)
    let made = 0
    await rebuild(t, businessId, 2, async () => {
      await createJobs(env, 1)
      made++
      await assignJob(t, first, [])
    })
    expect(made).toBeGreaterThan(0)
    expect(await jobIndexProblems(t)).toEqual([])
    expect((await owner.query(api.jobs.list, { businessId })).counts.new).toBe(
      3 + made,
    )
    expect(
      await t.run((ctx) => ctx.db.query('jobCountRebuilds').collect()),
    ).toEqual([])
  })

  it('ends equal to a recount whatever changes between its pages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(stepArb, { minLength: 3, maxLength: 12 }),
        fc.array(stepArb, { maxLength: 12 }),
        fc.integer({ min: 1, max: 3 }),
        async (before, during, size) => {
          const env = await stepper()
          const { t, businessId, apply } = env
          for (const step of before) await apply(step)
          await wipe(t)
          // A change or two after each page, until the steps run out.
          const queue = [...during]
          await rebuild(t, businessId, size, async () => {
            for (const step of queue.splice(0, 2)) await apply(step)
          })
          for (const step of queue) await apply(step)
          expect(await jobIndexProblems(t)).toEqual([])
          await expectCachesFresh(t)
        },
      ),
      { numRuns: 25 },
    )
  })
})
