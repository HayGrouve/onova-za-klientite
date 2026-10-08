import { ConvexError } from 'convex/values'

import type { ErrorCode } from '../../shared/errors'

export type { ErrorCode }

export function fail(
  code: ErrorCode,
  data: Record<string, string | number | boolean> = {},
): never {
  throw new ConvexError({ code, ...data })
}
