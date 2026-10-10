import { describe, expect, it } from 'vitest'
import { jobMainAction, paidShare } from './job-actions'

describe('jobMainAction', () => {
  it('is the next stage while there is one and the person may move the job', () => {
    expect(
      jobMainAction({ canMove: true, hasNext: true, owedCents: 500 }),
    ).toBe('next')
    expect(jobMainAction({ canMove: true, hasNext: true, owedCents: 0 })).toBe(
      'next',
    )
  })

  it('is the payment once there is no next stage and money is owed', () => {
    expect(
      jobMainAction({ canMove: true, hasNext: false, owedCents: 500 }),
    ).toBe('pay')
  })

  it('is the payment for a Worker, who never moves a job, while money is owed', () => {
    expect(
      jobMainAction({ canMove: false, hasNext: true, owedCents: 500 }),
    ).toBe('pay')
  })

  it('is nothing when the job is done and paid, or owes nothing and cannot move', () => {
    expect(jobMainAction({ canMove: true, hasNext: false, owedCents: 0 })).toBe(
      null,
    )
    expect(jobMainAction({ canMove: false, hasNext: true, owedCents: 0 })).toBe(
      null,
    )
  })
})

describe('paidShare', () => {
  it('is the part of the price paid so far', () => {
    expect(paidShare(30000, 95000)).toBeCloseTo(0.3158, 4)
    expect(paidShare(0, 95000)).toBe(0)
    expect(paidShare(95000, 95000)).toBe(1)
  })

  it('never runs past full, when more was paid than the price', () => {
    expect(paidShare(120000, 95000)).toBe(1)
  })

  it('is full for money paid on a job with no price yet, and empty for none', () => {
    expect(paidShare(5000, 0)).toBe(1)
    expect(paidShare(0, 0)).toBe(0)
  })

  it('never goes below empty after a refund', () => {
    expect(paidShare(-2000, 95000)).toBe(0)
  })
})
