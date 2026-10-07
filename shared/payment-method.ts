export type PaymentMethod = 'cash' | 'bank' | 'card' | 'other'

/**
 * The method for a new payment: cash, as D37 has it, unless the client has
 * paid before. Then it is the method of their latest payment, since most
 * clients pay the same way each time. Refunds are not payments they made, so
 * they don't count. `payments` is newest first.
 */
export function defaultPaymentMethod(
  payments: ReadonlyArray<{ amountCents: number; method: PaymentMethod }>,
): PaymentMethod {
  return payments.find((payment) => payment.amountCents > 0)?.method ?? 'cash'
}
