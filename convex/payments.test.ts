// @vitest-environment edge-runtime
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  STRANGER,
  addMember,
  assignJob,
  expectCachesFresh,
  getDoc,
  lastActivity,
  setupBusiness,
  setupConvex,
} from './test.setup'
import type { TestConvex } from './test.setup'

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

  it('a Worker cannot take more than the job still owes; a Manager still can', async () => {
    const { t, owner, businessId, clientId, jobIds, ...b } = await withJobs([
      10000,
    ])
    const { member: worker, membershipId } = await addMember(
      t,
      { owner, businessId, ...b },
      'worker',
    )
    const { member: manager } = await addMember(
      t,
      { owner, businessId, ...b },
      'manager',
    )
    await assignJob(t, jobIds[0], [membershipId])
    const pay = (who: typeof worker, amountCents: number) =>
      who.mutation(api.payments.addFromJob, {
        businessId,
        jobId: jobIds[0],
        amountCents,
        date: DATE,
        method: 'cash',
      })
    await expect(pay(worker, 10001)).rejects.toThrow(/payment.exceeds/)
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(0)
    await pay(worker, 6000)
    // 40 € left: one cent more is refused, the rest is accepted.
    await expect(pay(worker, 4001)).rejects.toThrow(/payment.exceeds/)
    await pay(worker, 4000)
    // Paid in full: a Worker can add nothing more.
    await expect(pay(worker, 1)).rejects.toThrow(/payment.exceeds/)
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(0)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    // A Manager may take more: the rest is client credit.
    await pay(manager, 2500)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(2500)
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

  it('refuses to delete a payment that was refunded against, and offers its refund first', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([10000])
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 10000,
      date: DATE,
      method: 'cash',
    })
    const refundId = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      jobId: jobIds[0],
      amountCents: 10000,
      date: DATE,
      method: 'cash',
    })
    expect(
      (await owner.query(api.payments.get, { businessId, paymentId }))
        .removable,
    ).toBe(false)
    await expect(
      owner.mutation(api.payments.remove, { businessId, paymentId }),
    ).rejects.toThrow(/payment.refunded/)
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(0)
    // Take the refund away first, and the payment can go.
    await owner.mutation(api.payments.remove, {
      businessId,
      paymentId: refundId,
    })
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(10000)
    await owner.mutation(api.payments.remove, { businessId, paymentId })
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(0)
    await expectCachesFresh(t)
  })

  it('refuses to delete a payment whose credit was paid back', async () => {
    const { t, owner, businessId, clientId } = await withJobs([])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 5000,
      date: DATE,
      method: 'bank',
    })
    await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 2000,
      date: DATE,
      method: 'cash',
    })
    await expect(
      owner.mutation(api.payments.remove, { businessId, paymentId }),
    ).rejects.toThrow(/payment.refunded/)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(3000)
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

describe('payment edge cases', () => {
  it('a split never pays a cancelled job', async () => {
    const { owner, businessId, clientId, jobIds } = await withJobs([10000])
    await owner.mutation(api.jobs.cancel, { businessId, jobId: jobIds[0] })
    await expect(
      owner.mutation(api.payments.addFromClient, {
        businessId,
        clientId,
        amountCents: 5000,
        date: DATE,
        method: 'cash',
        allocations: [{ jobId: jobIds[0], amountCents: 5000 }],
      }),
    ).rejects.toThrow(/payment.exceeds/)
  })
})

async function allocationsOf(t: TestConvex, paymentId: Id<'payments'>) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query('allocations')
        .withIndex('by_payment', (q) => q.eq('paymentId', paymentId))
        .collect()
    ).map((allocation) => [allocation.jobId, allocation.amountCents] as const),
  )
}

describe('payments.get: how a payment was split', () => {
  it('names the jobs it paid and what is left as prepaid', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([
      10000, 3000,
    ])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 14000,
      date: DATE,
      method: 'bank',
      label: 'Капаро',
    })
    const payment = await owner.query(api.payments.get, {
      businessId,
      paymentId,
    })
    expect(payment).toMatchObject({
      amountCents: 14000,
      date: DATE,
      method: 'bank',
      label: 'Капаро',
      prepaidCents: 1000,
    })
    expect(payment.allocations).toEqual([
      { jobId: jobIds[0], title: 'Поръчка 1', amountCents: 10000 },
      { jobId: jobIds[1], title: 'Поръчка 2', amountCents: 3000 },
    ])
    // The split can't go under what the jobs got, and may grow.
    expect(payment.range).toEqual({
      minCents: 13000,
      maxCents: null,
      why: 'allocated',
    })
    await expectCachesFresh(t)
  })

  it('a payment left entirely as prepaid has no jobs', async () => {
    const { owner, businessId, clientId } = await withJobs([])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 5000,
      date: DATE,
      method: 'cash',
    })
    const payment = await owner.query(api.payments.get, {
      businessId,
      paymentId,
    })
    expect(payment.allocations).toEqual([])
    expect(payment.prepaidCents).toBe(5000)
  })

  it('a refund names the job it came from, or reads as prepaid', async () => {
    const { owner, businessId, clientId, jobIds } = await withJobs([30000])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 40000,
      date: DATE,
      method: 'cash',
    })
    const fromJob = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      jobId: jobIds[0],
      amountCents: 5000,
      date: DATE,
      method: 'cash',
    })
    const fromCredit = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 4000,
      date: DATE,
      method: 'cash',
    })
    const job = await owner.query(api.payments.get, {
      businessId,
      paymentId: fromJob,
    })
    expect(job.amountCents).toBe(-5000)
    expect(job.allocations).toEqual([
      { jobId: jobIds[0], title: 'Поръчка 1', amountCents: -5000 },
    ])
    expect(job.prepaidCents).toBe(0)
    // The job holds 250 after the refund: the refund may grow to 300.
    expect(job.range).toEqual({ minCents: 1, maxCents: 30000, why: 'none' })
    const credit = await owner.query(api.payments.get, {
      businessId,
      paymentId: fromCredit,
    })
    expect(credit.allocations).toEqual([])
    expect(credit.prepaidCents).toBe(4000)
    // 100 of credit was left before this refund; 60 is left now.
    expect(credit.range.maxCents).toBe(4000 + 6000)
  })

  it('is for managers, and for a worker only on a job assigned to them', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { owner, businessId } = b
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Шкаф',
      typedPriceCents: 10000,
    })
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId,
      amountCents: 4000,
      date: DATE,
      method: 'cash',
    })
    const { member: worker, membershipId } = await addMember(t, b, 'worker')
    await expect(
      worker.query(api.payments.get, { businessId, paymentId }),
    ).rejects.toThrow(/auth.forbidden/)
    await assignJob(t, jobId, [membershipId])
    const seen = await worker.query(api.payments.get, { businessId, paymentId })
    expect(seen.amountCents).toBe(4000)
    // A worker may look, never change.
    await expect(
      worker.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents: 5000,
        date: DATE,
        method: 'cash',
      }),
    ).rejects.toThrow(/auth.forbidden/)
  })

  it("never shows another business's payment", async () => {
    const t = setupConvex()
    const first = await setupBusiness(t)
    const clientId = await first.owner.mutation(api.clients.create, {
      businessId: first.businessId,
      name: 'Мария',
    })
    const paymentId = await first.owner.mutation(api.payments.addFromClient, {
      businessId: first.businessId,
      clientId,
      amountCents: 1000,
      date: DATE,
      method: 'cash',
    })
    const other = await setupBusiness(t, {
      ...STRANGER,
      subject: 'user_other',
      tokenIdentifier: 'https://clerk.test|user_other',
    })
    await expect(
      other.owner.query(api.payments.get, {
        businessId: other.businessId,
        paymentId,
      }),
    ).rejects.toThrow(/notFound/)
    await expect(
      other.owner.mutation(api.payments.update, {
        businessId: other.businessId,
        paymentId,
        amountCents: 2000,
        date: DATE,
        method: 'cash',
      }),
    ).rejects.toThrow(/notFound/)
  })
})

describe('payments.update', () => {
  it('fixes a typo on a job: 2010 becomes 2100 and the job is paid', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([210000])
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 201000,
      date: DATE,
      method: 'cash',
    })
    await owner.mutation(api.payments.update, {
      businessId,
      paymentId,
      amountCents: 210000,
      date: DATE,
      method: 'cash',
    })
    const job = await getDoc(t, 'jobs', jobIds[0])
    expect(job).toMatchObject({ paidCents: 210000, balanceCents: 0 })
    expect(job.owes).toBe(false)
    expect((await getDoc(t, 'payments', paymentId)).amountCents).toBe(210000)
    expect(await allocationsOf(t, paymentId)).toEqual([[jobIds[0], 210000]])
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    expect((await lastActivity(t)).type).toBe('payment.edited')
    await expectCachesFresh(t)
  })

  it('lowers an amount and gives the balance back', async () => {
    const { t, owner, businessId, jobIds } = await withJobs([100000])
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 100000,
      date: DATE,
      method: 'cash',
    })
    await owner.mutation(api.payments.update, {
      businessId,
      paymentId,
      amountCents: 40000,
      date: DATE,
      method: 'cash',
    })
    expect(await getDoc(t, 'jobs', jobIds[0])).toMatchObject({
      paidCents: 40000,
      balanceCents: 60000,
      owes: true,
    })
    await expectCachesFresh(t)
  })

  it('an overpaid job: the extra stays prepaid and follows the edit', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([260000])
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 310000,
      date: DATE,
      method: 'bank',
    })
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(50000)
    const edit = (amountCents: number) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents,
        date: DATE,
        method: 'bank',
      })
    await edit(300000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(40000)
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(260000)
    await edit(200000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    expect((await getDoc(t, 'jobs', jobIds[0])).balanceCents).toBe(60000)
    await expectCachesFresh(t)
  })

  it('changes only the date, method and label without touching the split', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([
      10000, 3000,
    ])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 14000,
      date: DATE,
      method: 'cash',
      label: 'Капаро',
    })
    const before = await allocationsOf(t, paymentId)
    await owner.mutation(api.payments.update, {
      businessId,
      paymentId,
      amountCents: 14000,
      date: '2026-10-01',
      method: 'card',
      label: 'Аванс',
    })
    expect(await getDoc(t, 'payments', paymentId)).toMatchObject({
      amountCents: 14000,
      date: '2026-10-01',
      method: 'card',
      label: 'Аванс',
    })
    expect(await allocationsOf(t, paymentId)).toEqual(before)
    expect(
      (await getDoc(t, 'jobs', jobIds[0])).paidCents +
        (await getDoc(t, 'jobs', jobIds[1])).paidCents,
    ).toBe(13000)
    await expectCachesFresh(t)
    // An empty label removes it.
    await owner.mutation(api.payments.update, {
      businessId,
      paymentId,
      amountCents: 14000,
      date: '2026-10-01',
      method: 'card',
      label: '  ',
    })
    expect((await getDoc(t, 'payments', paymentId)).label).toBeUndefined()
  })

  it('moves a payment to another month in the Money screen', async () => {
    const { owner, businessId, clientId } = await withJobs([])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 5000,
      date: '2026-10-02',
      method: 'cash',
    })
    await owner.mutation(api.payments.update, {
      businessId,
      paymentId,
      amountCents: 5000,
      date: '2026-09-30',
      method: 'cash',
    })
    const october = await owner.query(api.money.summary, {
      businessId,
      month: '2026-10',
    })
    const september = await owner.query(api.money.summary, {
      businessId,
      month: '2026-09',
    })
    expect(october.receivedCents).toBe(0)
    expect(september.receivedCents).toBe(5000)
  })

  it('never goes below what was already refunded on the job', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([100000])
    const paymentId = await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 100000,
      date: DATE,
      method: 'cash',
    })
    await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      jobId: jobIds[0],
      amountCents: 50000,
      date: DATE,
      method: 'cash',
    })
    const edit = (amountCents: number) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents,
        date: DATE,
        method: 'cash',
      })
    await expect(edit(49999)).rejects.toThrow(/payment.tooLow/)
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(50000)
    await edit(50000)
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(0)
    await expectCachesFresh(t)
  })

  it('a payment only in client credit changes, but not under what was refunded', async () => {
    const { t, owner, businessId, clientId } = await withJobs([])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 100000,
      date: DATE,
      method: 'bank',
    })
    await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 30000,
      date: DATE,
      method: 'cash',
    })
    const edit = (amountCents: number) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents,
        date: DATE,
        method: 'bank',
      })
    await edit(150000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(120000)
    await expect(edit(29999)).rejects.toThrow(/payment.tooLow/)
    await edit(30000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    expect(await allocationsOf(t, paymentId)).toEqual([])
    await expectCachesFresh(t)
  })

  it('a payment whose credit was applied to a job shrinks the prepaid part first', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([20000])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 50000,
      date: DATE,
      method: 'bank',
      allocations: [],
    })
    await owner.mutation(api.payments.useCredit, {
      businessId,
      jobId: jobIds[0],
    })
    // 200 sits on the job now and 300 is still prepaid. The payment is on one job.
    const edit = (amountCents: number) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents,
        date: DATE,
        method: 'bank',
      })
    await edit(30000)
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(20000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(10000)
    await edit(10000)
    expect(await getDoc(t, 'jobs', jobIds[0])).toMatchObject({
      paidCents: 10000,
      balanceCents: 10000,
    })
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    await expectCachesFresh(t)
  })

  it('a payment over several jobs keeps its split, and refuses less than the split', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([
      10000, 3000,
    ])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 13000,
      date: DATE,
      method: 'bank',
    })
    const edit = (amountCents: number) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents,
        date: DATE,
        method: 'bank',
      })
    await expect(edit(12999)).rejects.toThrow(/payment.tooLow/)
    await edit(15000)
    expect(await allocationsOf(t, paymentId)).toEqual([
      [jobIds[0], 10000],
      [jobIds[1], 3000],
    ])
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(2000)
    await expectCachesFresh(t)
  })

  it('a refund can change within what the job or the credit still holds', async () => {
    const { t, owner, businessId, clientId, jobIds } = await withJobs([30000])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 40000,
      date: DATE,
      method: 'cash',
    })
    const fromJob = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      jobId: jobIds[0],
      amountCents: 5000,
      date: DATE,
      method: 'cash',
    })
    const fromCredit = await owner.mutation(api.payments.refund, {
      businessId,
      clientId,
      amountCents: 4000,
      date: DATE,
      method: 'cash',
    })
    const edit = (paymentId: Id<'payments'>, amountCents: number) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        amountCents,
        date: DATE,
        method: 'cash',
        note: 'Върнато',
      })
    // The job holds 250 after the refund, so the refund may grow to 300.
    await expect(edit(fromJob, 30001)).rejects.toThrow(/payment.exceeds/)
    await edit(fromJob, 30000)
    expect(await getDoc(t, 'payments', fromJob)).toMatchObject({
      amountCents: -30000,
      note: 'Върнато',
    })
    expect(await allocationsOf(t, fromJob)).toEqual([[jobIds[0], -30000]])
    expect((await getDoc(t, 'jobs', jobIds[0])).paidCents).toBe(0)
    // The credit is 60 after the 40 refunded from it.
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(6000)
    await expect(edit(fromCredit, 10001)).rejects.toThrow(/credit.notEnough/)
    await edit(fromCredit, 10000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(0)
    await edit(fromCredit, 1000)
    expect((await getDoc(t, 'clients', clientId)).creditCents).toBe(9000)
    expect(await allocationsOf(t, fromCredit)).toEqual([])
    await expectCachesFresh(t)
  })

  it('rejects a zero amount and a bad date', async () => {
    const { owner, businessId, clientId } = await withJobs([])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 1000,
      date: DATE,
      method: 'cash',
    })
    const edit = (args: { amountCents: number; date: string }) =>
      owner.mutation(api.payments.update, {
        businessId,
        paymentId,
        method: 'cash',
        ...args,
      })
    await expect(edit({ amountCents: 0, date: DATE })).rejects.toThrow(
      /payment.zero/,
    )
    await expect(
      edit({ amountCents: 1000, date: '2026-13-40' }),
    ).rejects.toThrow(/invalid/)
    await expect(edit({ amountCents: -5, date: DATE })).rejects.toThrow(
      /invalid/,
    )
    await expect(edit({ amountCents: 10.5, date: DATE })).rejects.toThrow(
      /invalid/,
    )
  })

  it('saving with nothing changed writes nothing', async () => {
    const { t, owner, businessId, clientId } = await withJobs([])
    const paymentId = await owner.mutation(api.payments.addFromClient, {
      businessId,
      clientId,
      amountCents: 1000,
      date: DATE,
      method: 'cash',
      label: 'Капаро',
    })
    const activityBefore = await lastActivity(t)
    await owner.mutation(api.payments.update, {
      businessId,
      paymentId,
      amountCents: 1000,
      date: DATE,
      method: 'cash',
      label: 'Капаро',
    })
    expect((await lastActivity(t))._id).toBe(activityBefore._id)
  })
})

describe('editing keeps the money invariants', () => {
  type Step =
    | { kind: 'fromJob'; job: number; amount: number }
    | { kind: 'fromClient'; amount: number; empty: boolean }
    | { kind: 'refundJob'; job: number; amount: number }
    | { kind: 'refundCredit'; amount: number }
    | { kind: 'credit'; job: number }
    | { kind: 'edit'; payment: number; amount: number }
    | { kind: 'remove'; payment: number }
  const amount = (max: number) => fc.integer({ min: 1, max })
  const step: fc.Arbitrary<Step> = fc.oneof(
    {
      weight: 2,
      arbitrary: fc.record({
        kind: fc.constant('fromJob' as const),
        job: fc.nat(2),
        amount: amount(50000),
      }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        kind: fc.constant('fromClient' as const),
        amount: amount(50000),
        empty: fc.boolean(),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('refundJob' as const),
        job: fc.nat(2),
        amount: amount(30000),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('refundCredit' as const),
        amount: amount(30000),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('credit' as const),
        job: fc.nat(2),
      }),
    },
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constant('edit' as const),
        payment: fc.nat(9),
        amount: amount(80000),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('remove' as const),
        payment: fc.nat(9),
      }),
    },
  )
  // Refused steps are part of the domain.
  const REFUSED =
    /credit.notEnough|payment.zero|payment.exceeds|payment.tooLow|payment.refunded/

  it('after any sequence the caches are fresh, and an edit or a delete never takes a job or the credit below zero', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 10 }), async (steps) => {
        const { t, owner, businessId, clientId, jobIds } = await withJobs([
          10000, 25000, 40000,
        ])
        const paymentIds: Array<Id<'payments'>> = []
        const read = async () => ({
          jobs: await Promise.all(
            jobIds.map(async (id) => (await getDoc(t, 'jobs', id)).paidCents),
          ),
          credit: (await getDoc(t, 'clients', clientId)).creditCents,
        })
        const pick = (index: number) =>
          paymentIds.at(index % Math.max(paymentIds.length, 1))
        for (const s of steps) {
          const before = await read()
          // Resolves to true when an edit was accepted.
          const run = async (): Promise<boolean> => {
            if (s.kind === 'fromJob') {
              paymentIds.push(
                await owner.mutation(api.payments.addFromJob, {
                  businessId,
                  jobId: jobIds[s.job],
                  amountCents: s.amount,
                  date: DATE,
                  method: 'cash',
                }),
              )
            } else if (s.kind === 'fromClient') {
              paymentIds.push(
                await owner.mutation(api.payments.addFromClient, {
                  businessId,
                  clientId,
                  amountCents: s.amount,
                  date: DATE,
                  method: 'bank',
                  ...(s.empty ? { allocations: [] } : {}),
                }),
              )
            } else if (s.kind === 'refundJob') {
              paymentIds.push(
                await owner.mutation(api.payments.refund, {
                  businessId,
                  clientId,
                  jobId: jobIds[s.job],
                  amountCents: s.amount,
                  date: DATE,
                  method: 'cash',
                }),
              )
            } else if (s.kind === 'refundCredit') {
              paymentIds.push(
                await owner.mutation(api.payments.refund, {
                  businessId,
                  clientId,
                  amountCents: s.amount,
                  date: DATE,
                  method: 'cash',
                }),
              )
            } else if (s.kind === 'credit') {
              await owner.mutation(api.payments.useCredit, {
                businessId,
                jobId: jobIds[s.job],
              })
            } else if (s.kind === 'edit') {
              const paymentId = pick(s.payment)
              if (!paymentId) return false
              await owner.mutation(api.payments.update, {
                businessId,
                paymentId,
                amountCents: s.amount,
                date: DATE,
                method: 'cash',
              })
              return true
            } else {
              const paymentId = pick(s.payment)
              if (!paymentId) return false
              await owner.mutation(api.payments.remove, {
                businessId,
                paymentId,
              })
              paymentIds.splice(paymentIds.indexOf(paymentId), 1)
              return true
            }
            return false
          }
          const edited = await run().catch((error: unknown) => {
            if (!REFUSED.test(String(error))) throw error
            return false
          })
          if (edited) {
            const after = await read()
            for (const [index, paid] of after.jobs.entries()) {
              expect(paid >= 0 || paid >= before.jobs[index]).toBe(true)
            }
            expect(after.credit >= 0 || after.credit >= before.credit).toBe(
              true,
            )
          }
        }
        await expectCachesFresh(t)
        // Every payment's allocations keep its sign and never exceed it.
        const rows = await t.run(async (ctx) => {
          const out = []
          for (const payment of await ctx.db.query('payments').collect()) {
            const allocations = await ctx.db
              .query('allocations')
              .withIndex('by_payment', (q) => q.eq('paymentId', payment._id))
              .collect()
            out.push({ payment, allocations })
          }
          return out
        })
        for (const { payment, allocations } of rows) {
          const total = allocations.reduce((sum, a) => sum + a.amountCents, 0)
          for (const allocation of allocations) {
            expect(Math.sign(allocation.amountCents)).toBe(
              Math.sign(payment.amountCents),
            )
          }
          expect(Math.abs(total)).toBeLessThanOrEqual(
            Math.abs(payment.amountCents),
          )
          expect(payment.amountCents).not.toBe(0)
        }
      }),
      { numRuns: 25 },
    )
  })
})

describe('jobs.get: where the rest of a payment went', () => {
  it('a row carries the whole payment and how much of it sits on the job', async () => {
    const { owner, businessId, jobIds } = await withJobs([260000])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 310000,
      date: DATE,
      method: 'bank',
      label: 'Капаро',
    })
    const { payments, job } = await owner.query(api.jobs.get, {
      businessId,
      jobId: jobIds[0],
    })
    expect(job).toMatchObject({ paidCents: 260000, balanceCents: 0 })
    expect(payments).toHaveLength(1)
    // 3100 was paid and 2600 is on the job, so 500 went to prepaid.
    expect(payments[0]).toMatchObject({
      amountCents: 260000,
      paymentAmountCents: 310000,
      paymentAllocatedCents: 260000,
    })
  })

  it('the rest shrinks once the credit is applied to another job', async () => {
    const { owner, businessId, clientId, jobIds } = await withJobs([260000])
    await owner.mutation(api.payments.addFromJob, {
      businessId,
      jobId: jobIds[0],
      amountCents: 310000,
      date: DATE,
      method: 'bank',
    })
    const other = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Друга',
      typedPriceCents: 50000,
    })
    await owner.mutation(api.payments.useCredit, { businessId, jobId: other })
    const { payments } = await owner.query(api.jobs.get, {
      businessId,
      jobId: jobIds[0],
    })
    expect(payments[0].paymentAllocatedCents).toBe(310000)
  })
})
