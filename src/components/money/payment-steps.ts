/**
 * A payment asks one thing at a time (D117): how much, then how, then shows
 * all of it once more before it is recorded.
 */
export const PAYMENT_STEPS = ['amount', 'method', 'review'] as const

export type PaymentStep = (typeof PAYMENT_STEPS)[number]

/** The next step; the review is the last. */
export function stepAfter(step: PaymentStep): PaymentStep {
  return PAYMENT_STEPS[
    Math.min(PAYMENT_STEPS.indexOf(step) + 1, PAYMENT_STEPS.length - 1)
  ]
}

/** The step before, or null on the first. */
export function stepBefore(step: PaymentStep): PaymentStep | null {
  const index = PAYMENT_STEPS.indexOf(step)
  return index > 0 ? PAYMENT_STEPS[index - 1] : null
}

/** The step's place, counted from one. */
export function stepNumber(step: PaymentStep) {
  return PAYMENT_STEPS.indexOf(step) + 1
}

/**
 * The amounts one tap away on the first step: everything owed, and half of
 * it (rounded up to a whole cent) when that is a different amount.
 */
export function quickAmounts(
  owedCents: number,
): Array<{ kind: 'whole' | 'half'; cents: number }> {
  if (owedCents <= 0) return []
  const half = Math.ceil(owedCents / 2)
  return half < owedCents
    ? [
        { kind: 'whole', cents: owedCents },
        { kind: 'half', cents: half },
      ]
    : [{ kind: 'whole', cents: owedCents }]
}
