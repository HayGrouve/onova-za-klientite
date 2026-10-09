import { useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReference } from 'convex/server'
import { useState } from 'react'

/** Whether two sets of query arguments differ at most in `now`. */
export function sameExceptNow(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  keys.delete('now')
  return [...keys].every((key) => a[key] === b[key])
}

/**
 * `useQuery` for a query that takes the clock as `now` (see `useNow`). When
 * only `now` moves on, the new result takes a moment to arrive and the query
 * is undefined meanwhile; this keeps the last result on screen instead of
 * flashing a skeleton. Any other change of arguments (another tab, another
 * business) still reads as loading.
 */
export function useQueryKeepPrevious<TQuery extends FunctionReference<'query'>>(
  query: TQuery,
  args: FunctionArgs<TQuery>,
) {
  const result = useQuery(query, args)
  const [last, setLast] = useState<{
    args: FunctionArgs<TQuery>
    result: NonNullable<typeof result>
  }>()
  if (result !== undefined && result !== last?.result) {
    setLast({ args, result })
  }
  if (result !== undefined) return result
  return last && sameExceptNow(last.args, args) ? last.result : undefined
}
