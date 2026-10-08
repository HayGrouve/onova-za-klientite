import { ConvexError } from 'convex/values'
import { m } from '#/paraglide/messages.js'
import { ERROR_CODES } from '../../shared/errors'
import type { ErrorCode } from '../../shared/errors'

const MESSAGES: Record<ErrorCode, () => string> = {
  'auth.signedOut': m.error_auth_signedOut,
  'auth.noUser': m.error_auth_noUser,
  'auth.notMember': m.error_auth_notMember,
  'auth.forbidden': m.error_auth_forbidden,
  notFound: m.error_notFound,
  invalid: m.error_invalid,
  'payment.zero': m.error_payment_zero,
  'payment.exceeds': m.error_payment_exceeds,
  'payment.signMismatch': m.error_payment_signMismatch,
  'payment.tooLow': m.error_payment_tooLow,
  'credit.notEnough': m.error_credit_notEnough,
  'job.otherClient': m.error_job_otherClient,
  'item.otherClient': m.error_job_otherClient,
  'item.otherJob': m.error_item_otherJob,
  'stage.hasJobs': m.error_stage_hasJobs,
  'job.noDate': m.error_job_noDate,
  'client.merged': m.error_client_merged,
  'stage.lastInGroup': m.error_stage_lastInGroup,
  'file.rejected': m.files_rejected,
  'field.typeChange': m.error_field_typeChange,
  'field.value': m.error_field_value,
  'client.noClient': m.error_client_noClient,
  'seed.notAllowed': m.error_seed_notAllowed,
}

const isErrorCode = (code: unknown): code is ErrorCode =>
  (ERROR_CODES as ReadonlyArray<unknown>).includes(code)

/** The error code Convex threw on purpose (D16), if it is one it knows. */
export function errorCode(error: unknown): ErrorCode | undefined {
  if (!(error instanceof ConvexError)) return undefined
  const data: unknown = error.data
  return data &&
    typeof data === 'object' &&
    'code' in data &&
    isErrorCode(data.code)
    ? data.code
    : undefined
}

/** A Bulgarian message for any error, from its code when it has one. */
export function errorMessage(error: unknown): string {
  const code = errorCode(error)
  return code ? MESSAGES[code]() : m.error_unknown()
}

/**
 * A record that isn't there for this person: an id from another business,
 * or an address that holds no id of that kind. The job, client and item
 * pages read their id from the address only through their `get` query,
 * which answers `notFound` for both (D16).
 */
export function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'notFound'
}
