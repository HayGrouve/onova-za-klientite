import { ConvexError } from 'convex/values'
import { m } from '#/paraglide/messages.js'

const MESSAGES: Partial<Record<string, () => string>> = {
  'auth.signedOut': m.error_auth_signedOut,
  'auth.noUser': m.error_auth_noUser,
  'auth.notMember': m.error_auth_notMember,
  'auth.forbidden': m.error_auth_forbidden,
  notFound: m.error_notFound,
  invalid: m.error_invalid,
  'payment.zero': m.error_payment_zero,
  'file.rejected': m.files_rejected,
}

/** The error code Convex threw on purpose (D16), if any. */
export function errorCode(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined
  const data: unknown = error.data
  if (data && typeof data === 'object' && 'code' in data) {
    return typeof data.code === 'string' ? data.code : undefined
  }
  return undefined
}

/** A Bulgarian message for any error, from its code when it has one. */
export function errorMessage(error: unknown): string {
  const code = errorCode(error)
  return (code && MESSAGES[code]?.()) || m.error_unknown()
}
