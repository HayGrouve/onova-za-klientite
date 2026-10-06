// Q15: a hidden per-device flag. `?timing` turns it on, `?timing=off` turns
// it off. While on, setup and "+" record how long they took, locally only.

const FLAG = 'onova.timing'
const RECORDS = 'onova.timing.records'
const MAX_RECORDS = 100

export type TimedFlow = 'setup' | 'newJob'

export type TimingRecord = { flow: TimedFlow; ms: number; at: number }

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Reads `?timing` from the address once, on app start. */
export function applyTimingFlag(search: string) {
  const value = new URLSearchParams(search).get('timing')
  if (value === null) return
  if (value === 'off') storage()?.removeItem(FLAG)
  else storage()?.setItem(FLAG, '1')
}

export function isTimingOn() {
  return storage()?.getItem(FLAG) === '1'
}

export function readTimings(): TimingRecord[] {
  try {
    const raw = storage()?.getItem(RECORDS)
    return raw ? (JSON.parse(raw) as TimingRecord[]) : []
  } catch {
    return []
  }
}

export function recordTiming(flow: TimedFlow, ms: number, at = Date.now()) {
  if (!isTimingOn()) return
  const records = [{ flow, ms, at }, ...readTimings()].slice(0, MAX_RECORDS)
  storage()?.setItem(RECORDS, JSON.stringify(records))
}

export function clearTimings() {
  storage()?.removeItem(RECORDS)
}

/** "1:05" for 65 seconds. */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
