// @vitest-environment edge-runtime
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { STAGE_GROUPS } from '../shared/stages'
import type { StageGroup } from '../shared/stages'
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
      fc.asyncProperty(
        fc.array(
          fc.oneof(
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
          ) as fc.Arbitrary<Step>,
          { maxLength: 14 },
        ),
        async (steps) => {
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
                  .withIndex('by_business_order', (q) =>
                    q.eq('businessId', businessId),
                  )
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
          for (const step of steps) {
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
                owner.mutation(api.jobs.cancel, {
                  businessId,
                  jobId: job(step.job)!,
                }),
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
        },
      ),
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

describe('the backfill', () => {
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
