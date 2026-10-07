import { ConvexError } from 'convex/values'

/**
 * Error codes the client turns into Bulgarian messages (D16). Convex never
 * returns UI text.
 */
export type ErrorCode =
  | 'auth.signedOut'
  | 'auth.noUser'
  | 'auth.notMember'
  | 'auth.forbidden'
  | 'notFound'
  | 'invalid'
  | 'seed.notAllowed'
  | 'stage.hasJobs'
  | 'stage.lastInGroup'
  | 'field.typeChange'
  | 'field.value'
  | 'client.noClient'
  | 'job.otherClient'
  | 'job.cancelled'
  | 'payment.signMismatch'
  | 'payment.exceeds'
  | 'payment.zero'
  | 'credit.notEnough'
  | 'job.noDate'
  | 'file.rejected'

export function fail(
  code: ErrorCode,
  data: Record<string, string | number | boolean> = {},
): never {
  throw new ConvexError({ code, ...data })
}
