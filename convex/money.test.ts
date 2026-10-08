// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import {
  OWNER,
  expectCachesFresh,
  setupBusiness,
  setupConvex,
} from './test.setup'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('money.summary', () => {
  it('figures match a hand calculation on the seed (Мебели Стоянов, October 2026)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
    vi.stubEnv('ALLOW_SEED', 'true')
    const t = setupConvex()
    const owner = t.withIdentity(OWNER)
    await owner.mutation(api.users.ensureCurrent, {})
    await t.mutation(internal.seed.dev, {})
    const viewer = await owner.query(api.users.viewer, {})
    const furniture = viewer!.businesses.find(
      (b) => b.name === 'Мебели Стоянов',
    )!

    const summary = await owner.query(api.money.summary, {
      businessId: furniture._id,
      month: '2026-10',
    })
    // Payments in October: 300 € deposit (5.10) and 100 € prepaid by Петър (23.10).
    expect(summary.receivedCents).toBe(30000 + 10000)
    // Costs in October: ПДЧ 220 (10.10), transport 60, rent 400, fuel 80.
    expect(summary.costCents).toBe(22000 + 6000 + 40000 + 8000)
    expect(summary.profitCents).toBe(40000 - 76000)
    // Still owed: Гардероб 650, Кухня 684, Офис бюра 800. The cancelled job doesn't count.
    expect(summary.stillOwedCents).toBe(65000 + 68400 + 80000)
    expect(summary.creditHeldCents).toBe(10000)
    // Q7: done work first.
    expect(
      summary.whoOwesMe.map((row) => [row.name, row.owedCents, row.doneJobs]),
    ).toEqual([
      ['Офис Строй ООД', 80000, 1],
      ['Мария Георгиева', 68400, 0],
      ['Иван Петров', 65000, 0],
    ])
    await expectCachesFresh(t)
  })

  it('the Today headline matches the Money screen, without its lists', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
    vi.stubEnv('ALLOW_SEED', 'true')
    const t = setupConvex()
    const owner = t.withIdentity(OWNER)
    await owner.mutation(api.users.ensureCurrent, {})
    await t.mutation(internal.seed.dev, {})
    const viewer = await owner.query(api.users.viewer, {})
    const furniture = viewer!.businesses.find(
      (b) => b.name === 'Мебели Стоянов',
    )!
    const args = { businessId: furniture._id, month: '2026-10' }

    const summary = await owner.query(api.money.summary, args)
    const headline = await owner.query(api.money.headline, args)
    expect(headline).toEqual({
      stillOwedCents: summary.stillOwedCents,
      owingJobs: summary.whoOwesMe.reduce((sum, row) => sum + row.jobs, 0),
      doneOwingJobs: summary.whoOwesMe.reduce(
        (sum, row) => sum + row.doneJobs,
        0,
      ),
      receivedCents: summary.receivedCents,
      profitCents: summary.profitCents,
    })
    expect(headline.owingJobs).toBe(3)
    expect(headline.doneOwingJobs).toBe(1)
  })

  it('an owing job whose client record is missing still shows, without throwing', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани',
    })
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Шкаф',
      typedPriceCents: 10000,
    })
    await t.run((ctx) => ctx.db.delete('clients', clientId))
    const summary = await owner.query(api.money.summary, {
      businessId,
      month: '2026-10',
    })
    expect(summary.whoOwesMe).toEqual([
      expect.objectContaining({ clientId, name: '', owedCents: 10000 }),
    ])
  })

  it('a refund lowers what was received in its month', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани',
    })
    await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 10000,
      date: '2026-09-30',
      method: 'cash',
    })
    await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 4000,
      date: '2026-10-02',
      method: 'cash',
    })
    const october = await owner.query(api.money.summary, {
      businessId,
      month: '2026-10',
    })
    expect(october.receivedCents).toBe(-4000)
    const september = await owner.query(api.money.summary, {
      businessId,
      month: '2026-09',
    })
    expect(september.receivedCents).toBe(10000)
    expect(october.creditHeldCents).toBe(6000)
  })

  it('rejects a malformed month', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await expect(
      owner.query(api.money.summary, { businessId, month: '10.2026' }),
    ).rejects.toThrow(/invalid/)
  })
})

describe('money.summary: who owes me', () => {
  it('splits what a client owes into finished work and work still going, and carries their phone', async () => {
    const t = setupConvex()
    const { owner, businessId, stage } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
      phones: [{ number: '0888123456' }],
    })
    const done = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Шкаф',
      typedPriceCents: 155000,
    })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: done,
      stageId: stage('done'),
    })
    const going = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Кухня',
      typedPriceCents: 125000,
    })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: going,
      stageId: stage('in_progress'),
    })
    // A cancelled job never owes.
    const cancelled = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Врата',
      typedPriceCents: 9900,
    })
    await owner.mutation(api.jobs.cancel, { businessId, jobId: cancelled })
    const walkIn = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Без телефон',
    })
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: walkIn,
      title: 'Рафт',
      typedPriceCents: 2000,
    })

    const { whoOwesMe } = await owner.query(api.money.summary, {
      businessId,
      month: '2026-10',
    })
    const row = whoOwesMe.find((item) => item.clientId === clientId)!
    expect(row).toMatchObject({
      owedCents: 280000,
      doneOwedCents: 155000,
      jobs: 2,
      doneJobs: 1,
    })
    expect(row.phone).toBe('+359888123456')
    const other = whoOwesMe.find((item) => item.clientId === walkIn)!
    expect(other).toMatchObject({ owedCents: 2000, doneOwedCents: 0 })
    expect(other.phone).toBeUndefined()
    for (const item of whoOwesMe) {
      expect(item.doneOwedCents).toBeLessThanOrEqual(item.owedCents)
    }
  })

  it("names the job on each of the month's payments, or says prepaid", async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани',
    })
    const first = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Профилактика',
      typedPriceCents: 10000,
    })
    const second = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Ремонт',
      typedPriceCents: 3000,
    })
    const split = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 14000,
      date: '2026-10-03',
      method: 'cash',
    })
    const third = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Монтаж',
      typedPriceCents: 5000,
    })
    const onJob = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: third,
      amountCents: 2000,
      date: '2026-10-04',
      method: 'card',
    })
    const refundFromCredit = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 500,
      date: '2026-10-05',
      method: 'cash',
    })
    const refundFromJob = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      jobId: third,
      amountCents: 300,
      date: '2026-10-06',
      method: 'cash',
    })
    const { payments } = await owner.query(api.money.summary, {
      businessId,
      month: '2026-10',
    })
    const byId = new Map(payments.map((payment) => [payment._id, payment]))
    expect(byId.get(split)).toMatchObject({
      jobs: [
        { _id: first, title: 'Профилактика' },
        { _id: second, title: 'Ремонт' },
      ],
      creditCents: 1000,
    })
    expect(byId.get(onJob)).toMatchObject({
      jobs: [{ _id: third, title: 'Монтаж' }],
      creditCents: 0,
    })
    expect(byId.get(refundFromCredit)).toMatchObject({
      jobs: [],
      creditCents: 500,
    })
    expect(byId.get(refundFromJob)).toMatchObject({
      jobs: [{ _id: third, title: 'Монтаж' }],
      creditCents: 0,
    })
  })
})
