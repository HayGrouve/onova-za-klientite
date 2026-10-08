import type { Doc } from '../../../convex/_generated/dataModel'

/** Who the job is for, as picked or read from the line. */
export type ClientChoice =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'contact'; name: string; phone?: string }
  | { kind: 'new'; name: string; phone?: string }
  | { kind: 'none' }

export type PaymentMethod = Doc<'payments'>['method']

/** A client's item as "+" gets it: the folded words (model, plate) are what a word of the line is matched to. */
export type ItemRef = {
  id: string
  clientId: string
  name: string
  keys: string
}
