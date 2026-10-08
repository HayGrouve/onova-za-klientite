import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  checkAllocations,
  jobBalanceCents,
  jobOwedCents,
  jobOwes,
  jobPriceCents,
  jobProfitCents,
  jobProfitIsFinal,
  splitPayment,
} from './allocation'

describe('jobPriceCents', () => {
  it('sums the line totals', () => {
    expect(
      jobPriceCents([
        { quantity: 2, unitPriceCents: 1000 },
        { quantity: 0.5, unitPriceCents: 5 },
      ]),
    ).toBe(2003)
  })

  it('ignores the typed price when there are lines', () => {
    expect(jobPriceCents([{ quantity: 1, unitPriceCents: 700 }], 999)).toBe(700)
  })

  it('uses the typed price without lines, or zero', () => {
    expect(jobPriceCents([], 12000)).toBe(12000)
    expect(jobPriceCents([])).toBe(0)
  })
})

describe('jobBalanceCents and jobOwes', () => {
  it('is price - paid - write-off', () => {
    expect(
      jobBalanceCents({
        priceCents: 10000,
        paidCents: 4000,
        writeOffCents: 500,
      }),
    ).toBe(5500)
    expect(
      jobBalanceCents({
        priceCents: 10000,
        paidCents: 12000,
        writeOffCents: 0,
      }),
    ).toBe(-2000)
  })

  it('owes only with a positive balance outside cancelled', () => {
    expect(jobOwes(1, 'new')).toBe(true)
    expect(jobOwes(1, 'in_progress')).toBe(true)
    expect(jobOwes(1, 'done')).toBe(true)
    expect(jobOwes(1, 'cancelled')).toBe(false)
    expect(jobOwes(0, 'done')).toBe(false)
    expect(jobOwes(-5, 'done')).toBe(false)
  })

  it('owes its balance only when it owes', () => {
    expect(jobOwedCents({ owes: true, balanceCents: 4200 })).toBe(4200)
    expect(jobOwedCents({ owes: false, balanceCents: 4200 })).toBe(0)
    expect(jobOwedCents({ owes: false, balanceCents: -300 })).toBe(0)
  })

  it('keeps price = paid + balance + write-off', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: 0, max: 1e9 }),
        (priceCents, paidCents, writeOffCents) => {
          const balance = jobBalanceCents({
            priceCents,
            paidCents,
            writeOffCents,
          })
          expect(paidCents + balance + writeOffCents).toBe(priceCents)
        },
      ),
    )
  })
})

describe('jobProfitCents and jobProfitIsFinal', () => {
  it('is paid minus costs: a deposit with no costs is all profit so far', () => {
    expect(jobProfitCents({ paidCents: 80000, costCents: 0 })).toBe(80000)
    expect(jobProfitCents({ paidCents: 0, costCents: 65000 })).toBe(-65000)
  })

  it('is final only when the job is done or cancelled', () => {
    expect(jobProfitIsFinal('new')).toBe(false)
    expect(jobProfitIsFinal('in_progress')).toBe(false)
    expect(jobProfitIsFinal('done')).toBe(true)
    expect(jobProfitIsFinal('cancelled')).toBe(true)
  })
})

describe('splitPayment', () => {
  it('fills jobs in order and keeps the rest as credit', () => {
    expect(
      splitPayment(10000, [
        { jobId: 'a', balanceCents: 4000 },
        { jobId: 'b', balanceCents: 5000 },
        { jobId: 'c', balanceCents: 3000 },
      ]),
    ).toEqual({
      allocations: [
        { jobId: 'a', amountCents: 4000 },
        { jobId: 'b', amountCents: 5000 },
        { jobId: 'c', amountCents: 1000 },
      ],
      creditCents: 0,
    })
  })

  it('skips jobs with no balance', () => {
    expect(
      splitPayment(5000, [
        { jobId: 'a', balanceCents: 0 },
        { jobId: 'b', balanceCents: -300 },
        { jobId: 'c', balanceCents: 2000 },
      ]),
    ).toEqual({
      allocations: [{ jobId: 'c', amountCents: 2000 }],
      creditCents: 3000,
    })
  })

  it('turns everything into credit without open jobs', () => {
    expect(splitPayment(700, [])).toEqual({ allocations: [], creditCents: 700 })
  })

  it('throws on a payment that is not positive', () => {
    expect(() => splitPayment(0, [])).toThrow()
    expect(() => splitPayment(-100, [])).toThrow()
  })

  const openJobs = fc.array(
    fc.record({
      jobId: fc.string({ minLength: 1 }),
      balanceCents: fc.integer({ min: -100_000, max: 1_000_000 }),
    }),
    { maxLength: 12 },
  )
  const amount = fc.integer({ min: 1, max: 5_000_000 })

  it('allocations plus credit equal the payment', () => {
    fc.assert(
      fc.property(amount, openJobs, (cents, jobs) => {
        const { allocations, creditCents } = splitPayment(cents, jobs)
        const sum = allocations.reduce((s, a) => s + a.amountCents, 0)
        expect(sum + creditCents).toBe(cents)
        expect(creditCents).toBeGreaterThanOrEqual(0)
      }),
    )
  })

  it('allocates only positive amounts, never above a balance', () => {
    fc.assert(
      fc.property(amount, openJobs, (cents, jobs) => {
        const { allocations } = splitPayment(cents, jobs)
        expect(allocations.length).toBeLessThanOrEqual(jobs.length)
        let i = 0
        for (const a of allocations) {
          expect(a.amountCents).toBeGreaterThan(0)
          while (jobs[i].jobId !== a.jobId || jobs[i].balanceCents <= 0) i++
          expect(a.amountCents).toBeLessThanOrEqual(jobs[i].balanceCents)
          i++
        }
      }),
    )
  })

  it('only leaves credit when every open balance is covered', () => {
    fc.assert(
      fc.property(amount, openJobs, (cents, jobs) => {
        const { allocations, creditCents } = splitPayment(cents, jobs)
        if (creditCents > 0) {
          const owed = jobs.reduce((s, j) => s + Math.max(0, j.balanceCents), 0)
          const allocated = allocations.reduce((s, a) => s + a.amountCents, 0)
          expect(allocated).toBe(owed)
        }
      }),
    )
  })

  it('passes checkAllocations', () => {
    fc.assert(
      fc.property(amount, openJobs, (cents, jobs) => {
        const { allocations } = splitPayment(cents, jobs)
        expect(checkAllocations(cents, allocations)).toBe('ok')
      }),
    )
  })
})

describe('checkAllocations', () => {
  it('accepts allocations within the payment', () => {
    expect(
      checkAllocations(1000, [{ amountCents: 400 }, { amountCents: 600 }]),
    ).toBe('ok')
    expect(checkAllocations(1000, [])).toBe('ok')
    expect(checkAllocations(-1000, [{ amountCents: -400 }])).toBe('ok')
  })

  it('rejects a sign that differs from the payment', () => {
    expect(checkAllocations(1000, [{ amountCents: -100 }])).toBe('signMismatch')
    expect(checkAllocations(-1000, [{ amountCents: 100 }])).toBe('signMismatch')
  })

  it('rejects zero allocations', () => {
    expect(checkAllocations(1000, [{ amountCents: 0 }])).toBe('zero')
    expect(checkAllocations(-1000, [{ amountCents: 0 }])).toBe('zero')
  })

  it('rejects allocations that add up to more than the payment', () => {
    expect(
      checkAllocations(1000, [{ amountCents: 600 }, { amountCents: 401 }]),
    ).toBe('exceedsPayment')
    expect(checkAllocations(-1000, [{ amountCents: -1001 }])).toBe(
      'exceedsPayment',
    )
  })

  it('treats a zero payment with allocations as a sign mismatch', () => {
    expect(checkAllocations(0, [{ amountCents: 5 }])).toBe('signMismatch')
  })
})
