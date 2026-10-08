// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  expectCachesFresh,
  getDoc,
  lastActivity,
  setupBusiness,
  setupConvex,
} from './test.setup'

async function withJob() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const jobId = await b.owner.mutation(api.jobs.create, {
    businessId: b.businessId,
    clientId: b.noClientId,
    title: 'Гардероб',
    typedPriceCents: 50000,
  })
  return { t, ...b, jobId }
}

describe('stages', () => {
  it('a regrouped stage moves to the end of its new group', async () => {
    const { owner, businessId } = await withJob()
    const waiting = await owner.mutation(api.stages.add, {
      businessId,
      name: 'Чака час',
      group: 'new',
    })
    await owner.mutation(api.stages.update, {
      businessId,
      stageId: waiting,
      group: 'in_progress',
    })
    const { stages } = await owner.query(api.businesses.settings, {
      businessId,
    })
    const groups = stages.map((stage) => stage.group)
    expect(groups).toEqual(
      [...groups].sort(
        (a, b) =>
          ['new', 'in_progress', 'done', 'cancelled'].indexOf(a) -
          ['new', 'in_progress', 'done', 'cancelled'].indexOf(b),
      ),
    )
    const inProgress = stages.filter((stage) => stage.group === 'in_progress')
    expect(inProgress.at(-1)?._id).toBe(waiting)
  })

  it('a stage with jobs in it cannot be deleted until its jobs move', async () => {
    const { t, owner, businessId, stage, jobId } = await withJob()
    const extra = await owner.mutation(api.stages.add, {
      businessId,
      name: 'Чака части',
      group: 'new',
    })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId,
      stageId: extra,
    })
    await expect(
      owner.mutation(api.stages.remove, { businessId, stageId: extra }),
    ).rejects.toThrow(/stage.hasJobs/)
    await owner.mutation(api.stages.remove, {
      businessId,
      stageId: extra,
      moveJobsTo: stage('in_progress'),
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.stageId).toBe(stage('in_progress'))
    expect(job.stageGroup).toBe('in_progress')
    expect((await lastActivity(t)).type).toBe('stage.removed')
  })

  it('New, In progress and Done each keep at least one stage', async () => {
    const { owner, businessId, stage } = await withJob()
    for (const group of ['in_progress', 'done'] as const) {
      await expect(
        owner.mutation(api.stages.remove, {
          businessId,
          stageId: stage(group),
        }),
      ).rejects.toThrow(/stage.lastInGroup/)
      await expect(
        owner.mutation(api.stages.update, {
          businessId,
          stageId: stage(group),
          group: 'cancelled',
        }),
      ).rejects.toThrow(/stage.lastInGroup/)
    }
  })

  it('lists and money read stage groups: regrouping a stage moves its jobs with it', async () => {
    const { t, owner, businessId, jobId } = await withJob()
    const extra = await owner.mutation(api.stages.add, {
      businessId,
      name: 'Монтаж',
      group: 'in_progress',
    })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId,
      stageId: extra,
    })
    await owner.mutation(api.stages.update, {
      businessId,
      stageId: extra,
      group: 'cancelled',
    })
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.stageGroup).toBe('cancelled')
    expect(job.owes).toBe(false)
    await expectCachesFresh(t)
  })

  it('renaming a stage keeps its jobs; a new stage lands at the end of its group', async () => {
    const { t, owner, businessId, stage, stages } = await withJob()
    await owner.mutation(api.stages.update, {
      businessId,
      stageId: stage('new'),
      name: 'Оглед',
    })
    expect((await getDoc(t, 'stages', stage('new'))).name).toBe('Оглед')
    const added = await owner.mutation(api.stages.add, {
      businessId,
      name: 'Изработка',
      group: 'in_progress',
    })
    const inProgress = stages.find((item) => item.group === 'in_progress')!
    expect((await getDoc(t, 'stages', added)).order).toBe(inProgress.order + 1)
  })

  it('reordering needs every stage exactly once', async () => {
    const { owner, businessId, stages } = await withJob()
    const ids = stages.map((item) => item._id)
    await owner.mutation(api.stages.reorder, {
      businessId,
      stageIds: [...ids].reverse(),
    })
    await expect(
      owner.mutation(api.stages.reorder, {
        businessId,
        stageIds: ids.slice(1),
      }),
    ).rejects.toThrow(/invalid/)
  })
})

describe('stage edge cases', () => {
  it('regrouping out of Cancelled drops the cancel reason', async () => {
    const { t, owner, businessId, jobId } = await withJob()
    const lost = await owner.mutation(api.stages.add, {
      businessId,
      name: 'Загубени',
      group: 'cancelled',
    })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId,
      stageId: lost,
      cancelReason: 'Скъпо',
    })
    await owner.mutation(api.stages.update, {
      businessId,
      stageId: lost,
      group: 'new',
    })
    expect((await getDoc(t, 'jobs', jobId)).cancelReason).toBeUndefined()
  })

  it('reordering rejects a repeated stage', async () => {
    const { owner, businessId, stages } = await withJob()
    const ids = stages.map((item) => item._id)
    await expect(
      owner.mutation(api.stages.reorder, {
        businessId,
        stageIds: [ids[0], ids[0], ...ids.slice(2)],
      }),
    ).rejects.toThrow(/invalid/)
  })
})
