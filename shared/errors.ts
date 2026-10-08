/**
 * Every error code the server throws on purpose (D16). The client turns each
 * into a message; Convex never returns UI text. Both sides type against this
 * list, so a new code without a message doesn't compile.
 */
export const ERROR_CODES = [
  'auth.signedOut',
  'auth.noUser',
  'auth.notMember',
  'auth.forbidden',
  'notFound',
  'invalid',
  'seed.notAllowed',
  'stage.hasJobs',
  'stage.lastInGroup',
  'field.typeChange',
  'field.value',
  'client.noClient',
  'job.otherClient',
  'item.otherClient',
  'item.otherJob',
  'payment.signMismatch',
  'payment.exceeds',
  'payment.zero',
  'payment.tooLow',
  'payment.refunded',
  'credit.notEnough',
  'job.noDate',
  'client.merged',
  'file.rejected',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
