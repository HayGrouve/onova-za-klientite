import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { defaultPaymentMethod } from './payment-method'
import type { PaymentMethod } from './payment-method'

const pay = (method: PaymentMethod, amountCents = 1000) => ({
  amountCents,
  method,
})

describe('defaultPaymentMethod', () => {
  it('is cash for a client who has not paid yet (D37)', () => {
    expect(defaultPaymentMethod([])).toBe('cash')
  })

  it('is the method of the latest payment', () => {
    expect(defaultPaymentMethod([pay('bank'), pay('cash'), pay('card')])).toBe(
      'bank',
    )
  })

  it('skips refunds, which the client did not pay', () => {
    expect(defaultPaymentMethod([pay('cash', -500), pay('card')])).toBe('card')
    expect(defaultPaymentMethod([pay('card', -500)])).toBe('cash')
  })

  it('is always a method of some positive payment, or cash', () => {
    const method = fc.constantFrom<PaymentMethod>(
      'cash',
      'bank',
      'card',
      'other',
    )
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            amountCents: fc.integer({ min: -5000, max: 5000 }),
            method,
          }),
        ),
        (payments) => {
          const chosen = defaultPaymentMethod(payments)
          const paid = payments.filter((p) => p.amountCents > 0)
          expect(chosen).toBe(paid.at(0)?.method ?? 'cash')
        },
      ),
    )
  })
})
