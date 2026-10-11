/**
 * The job page's one solid button (D116): the next stage while there is one
 * and the person may move the job, then the payment while money is owed, and
 * nothing once there is nothing left to do. The payment stays in reach beside
 * the next stage, and as a quiet button when there is no main action.
 */
export function jobMainAction({
  canMove,
  hasNext,
  owedCents,
}: {
  /** Managers and the Owner move jobs; a Worker only sees the stage. */
  canMove: boolean
  /** A stage after the current one, outside the Cancelled group. */
  hasNext: boolean
  owedCents: number
}): 'next' | 'pay' | null {
  if (canMove && hasNext) return 'next'
  if (owedCents > 0) return 'pay'
  return null
}

/** How much of the price is paid, from 0 to 1, for the bar under the balance. */
export function paidShare(paidCents: number, priceCents: number) {
  if (paidCents <= 0) return 0
  if (priceCents <= 0) return 1
  return Math.min(paidCents / priceCents, 1)
}
