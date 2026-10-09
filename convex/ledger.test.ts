// @vitest-environment edge-runtime
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { moveJobsToClient, patchJob } from './lib/ledger'
import {
  addMember,
  assignJob,
  expectCachesFresh,
  getDoc,
  setupBusiness,
  setupConvex,
} from './test.setup'

describe('patchJob', () => {
  it('fails with notFound for a job that is gone, instead of a crash', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const client = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Клиент',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: client,
      title: 'Гардероб',
    })
    await t.run((ctx) => ctx.db.delete('jobs', jobId))
    const error = await t
      .run((ctx) => patchJob(ctx, jobId, { dueDate: '2026-10-10' }))
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ConvexError)
    expect((error as ConvexError<{ code: string }>).data.code).toBe('notFound')
  })
})

describe('moveJobsToClient', () => {
  it('moves the jobs and their assignment rows to the client, without recomputing money (D106)', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { owner, businessId } = b
    const [from, into] = [
      await owner.mutation(api.clients.create, { businessId, name: 'Първи' }),
      await owner.mutation(api.clients.create, { businessId, name: 'Втори' }),
    ]
    const { membershipId: workerId } = await addMember(t, b, 'worker')
    const assigned = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: from,
      title: 'С работник',
      typedPriceCents: 5000,
    })
    const plain = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: from,
      title: 'Без работник',
    })
    await assignJob(t, assigned, [workerId])
    // A cache that is wrong on purpose: only a recompute would put it right.
    await t.run((ctx) => ctx.db.patch('jobs', plain, { balanceCents: 777 }))

    const moved = await t.run((ctx) => moveJobsToClient(ctx, from, into))

    expect(moved.sort()).toEqual([assigned, plain].sort())
    expect((await getDoc(t, 'jobs', assigned)).clientId).toBe(into)
    expect((await getDoc(t, 'jobs', plain)).clientId).toBe(into)
    expect((await getDoc(t, 'jobs', plain)).balanceCents).toBe(777)
    const rows = await t.run((ctx) =>
      ctx.db
        .query('jobAssignments')
        .withIndex('by_job', (q) => q.eq('jobId', assigned))
        .collect(),
    )
    expect(rows.map((row) => row.clientId)).toEqual([into])
  })

  it('keeps every cache fresh through a merge', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { owner, businessId } = b
    const [from, into] = [
      await owner.mutation(api.clients.create, { businessId, name: 'Първи' }),
      await owner.mutation(api.clients.create, { businessId, name: 'Втори' }),
    ]
    const { membershipId: workerId } = await addMember(t, b, 'worker')
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: from,
      title: 'Работа',
      typedPriceCents: 5000,
    })
    await assignJob(t, jobId, [workerId])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId,
      amountCents: 2000,
      date: '2026-10-06',
      method: 'cash',
    })
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: from,
      intoId: into,
    })
    await expectCachesFresh(t)
  })
})
