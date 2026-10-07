// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import { sofiaTimeToUtc } from '../shared/dates'
import {
  expectCachesFresh,
  getDoc,
  setupBusiness,
  setupConvex,
} from './test.setup'

async function weeklyJob() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Офис',
  })
  const { jobId } = await b.owner.mutation(api.newJob.save, {
    businessId: b.businessId,
    client: { kind: 'existing', clientId },
    title: 'Почистване',
    typedPriceCents: 6000,
    when: { date: '2026-10-07', time: { hour: 8, minute: 30 } },
  })
  await b.owner.mutation(api.jobs.setRepeat, {
    businessId: b.businessId,
    jobId,
    every: 1,
    unit: 'week',
  })
  return { t, ...b, clientId, jobId }
}

describe('repeat (Q6)', () => {
  it('when the job’s date arrives, the next job is created one interval later', async () => {
    const { t, jobId } = await weeklyJob()
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBe('2026-10-07')
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-06' })).toBe(
      0,
    )
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      1,
    )

    const first = await getDoc(t, 'jobs', jobId)
    const nextId = first.repeat!.nextJobId!
    const next = await getDoc(t, 'jobs', nextId)
    expect(next.title).toBe('Почистване')
    expect(next.priceCents).toBe(6000)
    expect(next.stageGroup).toBe('new')
    expect(next.seriesId).toBe(jobId)
    expect(next.nextRepeatOn).toBe('2026-10-14')
    const appointment = (
      await t.run((ctx) =>
        ctx.db
          .query('appointments')
          .withIndex('by_job', (q) => q.eq('jobId', nextId))
          .collect(),
      )
    )[0]
    expect(appointment.start).toBe(sofiaTimeToUtc('2026-10-14', 8, 30))
    await expectCachesFresh(t)
  })

  it('is idempotent: running twice creates one job', async () => {
    const { t } = await weeklyJob()
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(2)
  })

  it('keeps the wall-clock time across the daylight saving change', async () => {
    const { t } = await weeklyJob()
    // 21 Oct → 28 Oct crosses the 25 Oct changeover.
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    await t.mutation(internal.repeat.run, { today: '2026-10-14' })
    await t.mutation(internal.repeat.run, { today: '2026-10-21' })
    const starts = (
      await t.run((ctx) => ctx.db.query('appointments').collect())
    )
      .map((item) => item.start)
      .sort()
    expect(starts.at(-1)).toBe(sofiaTimeToUtc('2026-10-28', 8, 30))
  })

  it('stop repeating ends the series', async () => {
    const { t, owner, businessId, jobId } = await weeklyJob()
    await owner.mutation(api.jobs.stopRepeat, { businessId, jobId })
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-30' })).toBe(
      0,
    )
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBeUndefined()
  })

  it('a job without a date cannot repeat', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'x',
    })
    await expect(
      owner.mutation(api.jobs.setRepeat, {
        businessId,
        jobId,
        every: 1,
        unit: 'month',
      }),
    ).rejects.toThrow(/job.noDate/)
  })

  it('a monthly due date moves by a month', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Абонамент',
      dueDate: '2026-01-31',
    })
    await owner.mutation(api.jobs.setRepeat, {
      businessId,
      jobId,
      every: 1,
      unit: 'month',
    })
    await t.mutation(internal.repeat.run, { today: '2026-02-01' })
    const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId!
    expect((await getDoc(t, 'jobs', nextId)).dueDate).toBe('2026-02-28')
  })
})
