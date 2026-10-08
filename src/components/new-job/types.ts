import type { Doc } from '../../../convex/_generated/dataModel'

export type { ClientChoice, ItemRef } from '../../../shared/new-job-draft'

export type PaymentMethod = Doc<'payments'>['method']
