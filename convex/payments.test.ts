// @vitest-environment edge-runtime
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  expectCachesFresh,
  getDoc,
  lastActivity,
  setupBusiness,
  setupConvex,
} from './test.setup'

const DATE = '2026-10-06'

async function withJobs(prices: number[]) {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Мария Георгиева',
  })
  const jobIds: Array<Id<'jobs'>> = []
  for (const [index, price] of prices.entries()) {
    jobIds.push(
      await b.owner.mutation(api.jobs.create, {
        businessId: b.businessId,
        clientId,
        title: `Поръчка ${index + 1}`,
        typedPriceCents: price,
      }),
    )
  }
  return { t, ...b, clientId, jobIds }
}

describe('payments', () => {
  it('paying from a job allocates to it; any rest becomes client credit', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([30000])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 50000,
      date: DATE,
      method: 'cash',
      label: 'Капаро',
    })
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(0)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(20000)
    expect((await lastActivity(t)).type).toBe('payment.added')
    await expectCachesFresh(t)
  })

  it('a payment from a client is split across their jobs, oldest first', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([
      10000, 20000, 30000,
    ])
    await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 25000,
      date: DATE,
      method: 'bank',
    })
    const balances = await Promise.all(
      jobIds.map(async (id) => (await getDoc(t, 'jobs', id)).balanceCents),
    )
    expect(balances).toEqual([0, 5000, 30000])
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    await expectCachesFresh(t)
  })

  it('a given split may not exceed the payment or a job balance', async () => {
    const { owner, businessId, clientId, jobIds } = await withJobs([
      10000, 20000,
    ])
    const pay = (
      allocations: Array<{ jobId: Id<'jobs'>; amountCents: number }>,
    ) =>
      owner.mutation(api.payments.addFromClient, {
        businessId,
        clientId,
        amountCents: 15000,
        date: DATE,
        method: 'bank',
        allocations,
      })
    await expect(
      pay([{ jobId: jobIds[0], amountCents: 12000 }]),
    ).rejects.toThrow(/payment.exceeds/)
    await expect(
      pay([
        { jobId: jobIds[0], amountCents: 10000 },
        { jobId: jobIds[1], amountCents: 10000 },
      ]),
    ).rejects.toThrow(/payment.exceeds/)
  })

  it('an allocation only goes to a job of the same client', async () => {
    const { owner, businessId, jobIds } = await withJobs([10000])
    const otherId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Друг',
    })
    await expect(
      owner.mutation(api.payments.addFromClient, {
        businessId,
        clientId: otherId,
        amountCents: 5000,
        date: DATE,
        method: 'cash',
        allocations: [{ jobId: jobIds[0], amountCents: 5000 }],
      }),
    ).rejects.toThrow(/job.otherClient/)
  })

  it('a refund is a negative payment', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([30000])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 40000,
      date: DATE,
      method: 'cash',
    })
    // Pay back the 100 € of credit, then 50 € taken on the job.
    const fromCredit = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 10000,
      date: DATE,
      method: 'cash',
    })
    await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      jobId: jobIds[0],
      amountCents: 5000,
      date: DATE,
      method: 'cash',
    })
    expect((await getDoc(t, 'payments', fromCredit)).amountCents).toBe(-10000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(5000)
    await expect(
      owner.mutation(api.payments.refund, {
        businessId,
        clientId,
        amountCents: 1,
        date: DATE,
        method: 'cash',
      }),
    ).rejects.toThrow(/credit.notEnough/)
    await expectCachesFresh(t)
  })

  it('client credit is used on a job only when asked (Q8)', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([20000])
    await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 20000,
      date: DATE,
      method: 'bank',
      allocations: [],
    })
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(20000)
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(20000)

    const used = await owner.mutation(api.payments.useCredit, {
      businessId,
      jobId: jobIds[0],
    })
    expect(used).toBe(20000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(0)
    expect((await lastActivity(t)).type).toBe('credit.used')
    await expectCachesFresh(t)
  })

  it('removing a payment gives the balance back', async () => {
    const { t, owner, businessId, jobIds } = await withJobs([20000])
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 5000,
      date: DATE,
      method: 'card',
    })
    await owner.mutation(api.payments.remove, { businessId, paymentId })
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(20000)
    expect((await lastActivity(t)).type).toBe('payment.removed')
    await expectCachesFresh(t)
  })

  it('every cache equals a recomputation after any sequence of money changes', async () => {
    type Step =
      | { kind: 'fromJob'; job: number; amount: number }
      | { kind: 'fromClient'; amount: number }
      | { kind: 'cost'; job: number; amount: number }
      | { kind: 'credit'; job: number }
      | { kind: 'writeOff'; job: number }
    const step: fc.Arbitrary<Step> = fc.oneof(
      fc.record({
        kind: fc.constant('fromJob' as const),
        job: fc.nat(2),
        amount: fc.integer({ min: 1, max: 50000 }),
      }),
      fc.record({
        kind: fc.constant('fromClient' as const),
        amount: fc.integer({ min: 1, max: 50000 }),
      }),
      fc.record({
        kind: fc.constant('cost' as const),
        job: fc.nat(2),
        amount: fc.integer({ min: 0, max: 20000 }),
      }),
      fc.record({ kind: fc.constant('credit' as const), job: fc.nat(2) }),
      fc.record({ kind: fc.constant('writeOff' as const), job: fc.nat(2) }),
    )
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 8 }), async (steps) => {
        const { t, owner, businessId, clientId, jobIds } = await withJobs([
          10000, 25000, 40000,
        ])
        for (const s of steps) {
          const run = async () => {
            if (s.kind === 'fromJob') {
              await owner.mutation(api.payments.addFromJob, {
                businessId,
                jobId: jobIds[s.job],
                amountCents: s.amount,
                date: DATE,
                method: 'cash',
              })
            } else if (s.kind === 'fromClient') {
              await owner.mutation(api.payments.addFromClient, {
                businessId,
                clientId,
                amountCents: s.amount,
                date: DATE,
                method: 'bank',
              })
            } else if (s.kind === 'cost') {
              await owner.mutation(api.costs.add, {
                businessId,
                jobId: jobIds[s.job],
                amountCents: s.amount,
                date: DATE,
                label: 'Материали',
              })
            } else if (s.kind === 'credit') {
              await owner.mutation(api.payments.useCredit, {
                businessId,
                jobId: jobIds[s.job],
              })
            } else {
              await owner.mutation(api.jobs.writeOff, {
                businessId,
                jobId: jobIds[s.job],
                note: 'x',
              })
            }
          }
          // Refused steps (no credit, nothing to write off) are part of the domain.
          await run().catch((error: unknown) => {
            if (!/credit.notEnough|payment.zero/.test(String(error)))
              throw error
          })
        }
        await expectCachesFresh(t)
        const allocations = await t.run((ctx) =>
          ctx.db.query('allocations').collect(),
        )
        for (const allocation of allocations)
          expect(allocation.amountCents).toBeGreaterThan(0)
      }),
      { numRuns: 25 },
    )
  })
})
