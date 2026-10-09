import { useCallback, useRef } from 'react'

/**
 * A function with a fixed identity that always calls the latest `fn`, so it
 * can go to memoized children without breaking them on every render.
 */
export function useStableCallback<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
) {
  const latest = useRef(fn)
  latest.current = fn
  return useCallback((...args: TArgs) => latest.current(...args), [])
}
