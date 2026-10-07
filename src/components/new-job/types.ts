import type { Doc } from '../../../convex/_generated/dataModel'

/** Who the job is for, as picked or read from the line. */
export type ClientChoice =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'contact'; name: string; phone?: string }
  | { kind: 'new'; name: string; phone?: string }
  | { kind: 'none' }

export type PaymentMethod = Doc<'payments'>['method']
