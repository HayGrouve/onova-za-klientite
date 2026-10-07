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
