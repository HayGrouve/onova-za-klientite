import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  paymentAmountRange,
  paymentPrepaidCents,
  planPaymentEdit,
  reallocate,
} from './payment-edit'
import type { PaymentEditState } from './payment-edit'

type State = PaymentEditState<string>

const job = (
  jobId: string,
  allocatedCents: number,
  paidCents = allocatedCents,
  roomCents = 0,
) => ({ jobId, allocatedCents, paidCents, roomCents })

const payment = (
  amountCents: number,
  jobs: State['jobs'],
  clientCreditCents = amountCents -
    jobs.reduce((s, j) => s + j.allocatedCents, 0),
): State => ({ kind: 'payment', amountCents, jobs, clientCreditCents })

const refund = (
  amountCents: number,
  jobs: State['jobs'],
  clientCreditCents: number,
): State => ({ kind: 'refund', amountCents, jobs, clientCreditCents })

describe('the prepaid part of a payment', () => {
  it('is what is on no job', () => {
    expect(
      paymentPrepaidCents(payment(14000, [job('a', 10000), job('b', 3000)])),
    ).toBe(1000)
    expect(paymentPrepaidCents(payment(5000, []))).toBe(5000)
    expect(paymentPrepaidCents(payment(5000, [job('a', 5000)]))).toBe(0)
  })

  it('is the credit paid back by a refund without a job', () => {
    expect(paymentPrepaidCents(refund(4000, [], 0))).toBe(4000)
    expect(paymentPrepaidCents(refund(4000, [job('a', 4000)], 0))).toBe(0)
  })
})

describe('a payment on one job', () => {
  it('moves a typo onto the job: 2010 becomes 2100', () => {
    const state = payment(201000, [job('a', 201000, 201000, 9000)])
    expect(planPaymentEdit(state, 210000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 210000 }],
      prepaidCents: 0,
    })
  })

  it('only fills the job up to what it still owes; the rest is prepaid', () => {
    const state = payment(100000, [job('a', 100000, 100000, 30000)])
    expect(planPaymentEdit(state, 150000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 130000 }],
      prepaidCents: 20000,
    })
  })

  it('adds nothing to a job that owes nothing (cancelled, or settled)', () => {
    const state = payment(100000, [job('a', 100000, 100000, 0)])
    expect(planPaymentEdit(state, 120000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 100000 }],
      prepaidCents: 20000,
    })
  })

  it('takes a decrease off the prepaid part first', () => {
    // 3100 paid on a job of 2600: 500 is prepaid.
    const state = payment(310000, [job('a', 260000)])
    expect(planPaymentEdit(state, 300000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 260000 }],
      prepaidCents: 40000,
    })
    expect(planPaymentEdit(state, 200000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 200000 }],
      prepaidCents: 0,
    })
  })

  it('keeps prepaid money prepaid: an increase never moves it onto the job (Q8)', () => {
    // 400 went to the job on purpose and 600 was left as prepaid; the job still owes 1700.
    const state = payment(100000, [job('a', 40000, 40000, 170000)], 60000)
    expect(planPaymentEdit(state, 110000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 40000 }],
      prepaidCents: 70000,
    })
  })

  it('never goes below what was refunded on the job', () => {
    // 1000 paid, 500 of it refunded: the job's paid total is 500.
    const state = payment(100000, [job('a', 100000, 50000)])
    expect(paymentAmountRange(state)).toEqual({
      minCents: 50000,
      maxCents: null,
      why: 'refunded',
    })
    expect(planPaymentEdit(state, 49999)).toEqual({
      ok: false,
      reason: 'tooLow',
      limitCents: 50000,
    })
    expect(planPaymentEdit(state, 50000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 50000 }],
      prepaidCents: 0,
    })
  })

  it('a job paid twice may go down to what the other payment left', () => {
    // This payment is 400 of the job's 1000 paid; the other 600 stay.
    const state = payment(40000, [job('a', 40000, 100000)])
    expect(paymentAmountRange(state).minCents).toBe(1)
  })
})

describe('a payment only in client credit', () => {
  it('changes freely when nothing was taken out of it', () => {
    const state = payment(100000, [])
    expect(paymentAmountRange(state)).toEqual({
      minCents: 1,
      maxCents: null,
      why: 'none',
    })
    expect(planPaymentEdit(state, 150000)).toEqual({
      ok: true,
      allocations: [],
      prepaidCents: 150000,
    })
  })

  it('never goes below the credit already refunded or used', () => {
    // 1000 prepaid, 300 refunded: 700 is left.
    const state = payment(100000, [], 70000)
    expect(paymentAmountRange(state)).toEqual({
      minCents: 30000,
      maxCents: null,
      why: 'refunded',
    })
    expect(planPaymentEdit(state, 29999)).toMatchObject({
      ok: false,
      reason: 'tooLow',
      limitCents: 30000,
    })
    expect(planPaymentEdit(state, 30000)).toMatchObject({ ok: true })
  })

  it('does not make an already negative credit worse', () => {
    const state = payment(100000, [], -5000)
    expect(paymentAmountRange(state).minCents).toBe(100000)
  })
})

describe('a payment over several jobs', () => {
  it('keeps its split: only the prepaid part changes', () => {
    // 100 for one job, 30 for another, 70 prepaid.
    const state = payment(20000, [job('a', 10000), job('b', 3000)], 7000)
    expect(planPaymentEdit(state, 30000)).toEqual({
      ok: true,
      allocations: [
        { jobId: 'a', amountCents: 10000 },
        { jobId: 'b', amountCents: 3000 },
      ],
      prepaidCents: 17000,
    })
    expect(planPaymentEdit(state, 13000)).toMatchObject({
      ok: true,
      prepaidCents: 0,
    })
  })

  it('refuses an amount under what is already split across jobs', () => {
    const state = payment(20000, [job('a', 10000), job('b', 3000)], 7000)
    expect(paymentAmountRange(state)).toEqual({
      minCents: 13000,
      maxCents: null,
      why: 'allocated',
    })
    expect(planPaymentEdit(state, 12999)).toEqual({
      ok: false,
      reason: 'tooLow',
      limitCents: 13000,
    })
  })
})

describe('a refund', () => {
  it('from a job can grow up to what the job was paid', () => {
    // 500 refunded of 1700 paid: the job's paid total is 1200.
    const state = refund(50000, [job('a', 50000, 120000)], 0)
    expect(paymentAmountRange(state)).toEqual({
      minCents: 1,
      maxCents: 170000,
      why: 'none',
    })
    expect(planPaymentEdit(state, 170000)).toEqual({
      ok: true,
      allocations: [{ jobId: 'a', amountCents: 170000 }],
      prepaidCents: 0,
    })
    expect(planPaymentEdit(state, 170001)).toEqual({
      ok: false,
      reason: 'tooHigh',
      limitCents: 170000,
    })
  })

  it('from credit can grow up to the credit that is left', () => {
    const state = refund(30000, [], 20000)
    expect(paymentAmountRange(state).maxCents).toBe(50000)
    expect(planPaymentEdit(state, 50000)).toEqual({
      ok: true,
      allocations: [],
      prepaidCents: 50000,
    })
    expect(planPaymentEdit(state, 50001)).toMatchObject({
      ok: false,
      reason: 'tooHigh',
    })
  })

  it('can always shrink', () => {
    expect(planPaymentEdit(refund(30000, [], 0), 1)).toMatchObject({ ok: true })
  })
})

// A job's paid total and a client's credit are what the invariants guard: they
// may not drop below zero because of an edit (D26), nor get worse than they are.
const ids = ['a', 'b', 'c']

const paymentState: fc.Arbitrary<State> = fc
  .tuple(
    fc.integer({ min: 0, max: 3 }),
    fc.array(
      fc.record({
        allocated: fc.integer({ min: 1, max: 50_000 }),
        // What the job's other payments and refunds add to its paid total.
        others: fc.integer({ min: -50_000, max: 50_000 }),
        room: fc.integer({ min: 0, max: 50_000 }),
      }),
      { minLength: 3, maxLength: 3 },
    ),
    fc.integer({ min: 0, max: 50_000 }),
    fc.integer({ min: 0, max: 50_000 }),
  )
  .map(([count, rows, prepaid, extraCredit]) => {
    const jobs = rows.slice(0, count).map((row, index) => ({
      jobId: ids[index],
      allocatedCents: row.allocated,
      paidCents: Math.max(row.allocated + row.others, 0),
      roomCents: row.room,
    }))
    const allocated = jobs.reduce((s, j) => s + j.allocatedCents, 0)
    const amountCents = allocated + prepaid + (count === 0 ? 1 : 0)
    return {
      kind: 'payment' as const,
      amountCents,
      jobs,
      // The client's credit holds at least this payment's unallocated part.
      clientCreditCents: amountCents - allocated + extraCredit,
    }
  })

const refundState: fc.Arbitrary<State> = fc
  .tuple(
    fc.boolean(),
    fc.integer({ min: 1, max: 50_000 }),
    fc.integer({ min: 0, max: 50_000 }),
    fc.integer({ min: 0, max: 50_000 }),
  )
  .map(([onJob, amountCents, otherPaid, credit]) => ({
    kind: 'refund' as const,
    amountCents,
    jobs: onJob
      ? [
          {
            jobId: 'a',
            allocatedCents: amountCents,
            // The job's paid total: the money paid on it, minus this refund.
            paidCents: otherPaid,
            roomCents: 0,
          },
        ]
      : [],
    clientCreditCents: credit,
  }))

const anyState = fc.oneof(paymentState, refundState)
const newAmount = fc.integer({ min: 1, max: 200_000 })

/** Applies an allocation plan to the job and credit caches, as a recompute would. */
function after(state: State, amountCents: number, allocationCents: number[]) {
  const sign = state.kind === 'payment' ? 1 : -1
  const was = state.jobs.map((j) => j.allocatedCents)
  const sumWas = was.reduce((s, x) => s + x, 0)
  const sumNow = allocationCents.reduce((s, x) => s + x, 0)
  return {
    jobPaid: state.jobs.map(
      (j, i) => j.paidCents + sign * (allocationCents[i] - was[i]),
    ),
    credit:
      state.clientCreditCents +
      sign * (amountCents - state.amountCents) -
      sign * (sumNow - sumWas),
    sumNow,
  }
}

function valid(state: State, amountCents: number, allocationCents: number[]) {
  const now = after(state, amountCents, allocationCents)
  return (
    now.sumNow <= amountCents &&
    now.jobPaid.every(
      (paid, i) => paid >= 0 || paid >= state.jobs[i].paidCents,
    ) &&
    (now.credit >= 0 || now.credit >= state.clientCreditCents)
  )
}

function allocationOf(
  state: State,
  plan: Array<{ jobId: string; amountCents: number }>,
) {
  return state.jobs.map(
    (j) => plan.find((a) => a.jobId === j.jobId)?.amountCents ?? 0,
  )
}

describe('editing a payment, in general', () => {
  it('the range is exactly where the edit keeps every invariant', () => {
    fc.assert(
      fc.property(anyState, newAmount, (state, amount) => {
        const plan = planPaymentEdit(state, amount)
        const raw = allocationOf(state, reallocate(state, amount))
        expect(plan.ok).toBe(valid(state, amount, raw))
        const range = paymentAmountRange(state)
        expect(plan.ok).toBe(
          amount >= range.minCents &&
            (range.maxCents === null || amount <= range.maxCents),
        )
      }),
      { numRuns: 500 },
    )
  })

  it('an accepted edit never lets a job or the client go below zero', () => {
    fc.assert(
      fc.property(anyState, newAmount, (state, amount) => {
        const plan = planPaymentEdit(state, amount)
        if (!plan.ok) return
        const now = after(state, amount, allocationOf(state, plan.allocations))
        for (const [i, paid] of now.jobPaid.entries()) {
          expect(paid >= 0 || paid >= state.jobs[i].paidCents).toBe(true)
        }
        expect(now.credit >= 0 || now.credit >= state.clientCreditCents).toBe(
          true,
        )
      }),
      { numRuns: 500 },
    )
  })

  it('allocations keep the payment, its jobs and its sign in order', () => {
    fc.assert(
      fc.property(anyState, newAmount, (state, amount) => {
        const plan = planPaymentEdit(state, amount)
        if (!plan.ok) return
        const total = plan.allocations.reduce((s, a) => s + a.amountCents, 0)
        // Never more than the payment, and the rest is exactly the prepaid part.
        expect(total).toBeLessThanOrEqual(amount)
        expect(total + plan.prepaidCents).toBe(amount)
        // Only jobs it already sat on, each once, each above zero.
        const jobIds = plan.allocations.map((a) => a.jobId)
        expect(new Set(jobIds).size).toBe(jobIds.length)
        for (const a of plan.allocations) {
          expect(a.amountCents).toBeGreaterThan(0)
          expect(state.jobs.map((j) => j.jobId)).toContain(a.jobId)
        }
        // A refund always sits fully on its job, or fully on credit.
        if (state.kind === 'refund') {
          expect(plan.prepaidCents).toBe(state.jobs.length ? 0 : amount)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('a payment over several jobs keeps every job amount as it was', () => {
    fc.assert(
      fc.property(paymentState, newAmount, (state, amount) => {
        if (state.jobs.length < 2) return
        const plan = planPaymentEdit(state, amount)
        if (!plan.ok) return
        expect(plan.allocations).toEqual(
          state.jobs.map((j) => ({
            jobId: j.jobId,
            amountCents: j.allocatedCents,
          })),
        )
      }),
    )
  })

  it('saving the same amount changes no allocation', () => {
    fc.assert(
      fc.property(anyState, (state) => {
        const plan = planPaymentEdit(state, state.amountCents)
        expect(plan.ok).toBe(true)
        if (!plan.ok) return
        expect(plan.allocations).toEqual(
          state.jobs.map((j) => ({
            jobId: j.jobId,
            amountCents: j.allocatedCents,
          })),
        )
      }),
    )
  })
})
