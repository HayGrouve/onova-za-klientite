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
  | 'seed.notAllowed'

export function fail(
  code: ErrorCode,
  data: Record<string, unknown> = {},
): never {
  throw new ConvexError({ code, ...data })
}
