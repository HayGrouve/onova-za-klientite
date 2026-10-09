import { useSyncExternalStore } from 'react'
import { roundedNow } from '../../shared/dates'

const listeners = new Set<() => void>()
let timer: number | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  // One timer for everyone, so every caller sees the same step.
  timer ??= window.setInterval(() => {
    for (const notify of listeners) notify()
  }, 30_000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      timer = undefined
    }
  }
}

const read = () => roundedNow(Date.now())

/**
 * The time in 5-minute steps, for queries that depend on the clock (the next
 * appointment window). A query only reruns when its data or arguments change,
 * so the clock is an argument; coarse, so the result is still shared and cached.
 */
export function useNow() {
  return useSyncExternalStore(subscribe, read, read)
}
