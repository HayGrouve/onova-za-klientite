import { describe, expect, it } from 'vitest'
import {
  PAYMENT_STEPS,
  quickAmounts,
  stepAfter,
  stepBefore,
  stepNumber,
} from './payment-steps'

describe('the payment steps', () => {
  it('ask the amount, then the method, then show the review', () => {
    expect(PAYMENT_STEPS).toEqual(['amount', 'method', 'review'])
  })

  it('go forward one at a time and stop at the review', () => {
    expect(stepAfter('amount')).toBe('method')
    expect(stepAfter('method')).toBe('review')
    expect(stepAfter('review')).toBe('review')
  })

  it('go back one at a time, with nothing before the amount', () => {
    expect(stepBefore('review')).toBe('method')
    expect(stepBefore('method')).toBe('amount')
    expect(stepBefore('amount')).toBeNull()
  })

  it('count from one for the step bars', () => {
    expect(PAYMENT_STEPS.map(stepNumber)).toEqual([1, 2, 3])
  })
})

describe('quickAmounts', () => {
  it('offers the whole balance and half of it', () => {
    expect(quickAmounts(68400)).toEqual([
      { kind: 'whole', cents: 68400 },
      { kind: 'half', cents: 34200 },
    ])
  })

  it('rounds half of an odd amount of cents up to a whole cent', () => {
    expect(quickAmounts(68401)).toEqual([
      { kind: 'whole', cents: 68401 },
      { kind: 'half', cents: 34201 },
    ])
  })

  it('offers only the whole of a balance too small to halve', () => {
    expect(quickAmounts(1)).toEqual([{ kind: 'whole', cents: 1 }])
  })

  it('offers nothing when nothing is owed', () => {
    expect(quickAmounts(0)).toEqual([])
    expect(quickAmounts(-500)).toEqual([])
  })
})
