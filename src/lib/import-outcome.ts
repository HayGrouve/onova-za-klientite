import { useMemo, useSyncExternalStore } from 'react'

/** How an import ended. */
export type ImportOutcome = {
  businessId: string
  created: number
  skipped: number
  /** It stopped part way (what was added stays). */
  failed: boolean
  at: number
}

// A result is kept for a short while after the import, so the page shows it
// even if the screen was rebuilt or reloaded just as the import finished,
// instead of the empty start screen of an import that already happened.
export const OUTCOME_FRESH_MS = 60_000

const KEY = 'import-outcome'

/** The result in `raw`, if it is a fresh one of this business. */
export function parseOutcome(
  raw: string | null,
  now: number,
  businessId: string,
): ImportOutcome | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const item = value as Partial<ImportOutcome>
  if (
    item.businessId !== businessId ||
    typeof item.created !== 'number' ||
    typeof item.skipped !== 'number' ||
    typeof item.failed !== 'boolean' ||
    typeof item.at !== 'number' ||
    now - item.at > OUTCOME_FRESH_MS
  ) {
    return null
  }
  return item as ImportOutcome
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Keeps the result. Called by the import itself, so it works even if the page that started it is gone. */
export function saveOutcome(outcome: ImportOutcome) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(outcome))
  } catch {
    // Private mode: the page still shows the result while it stays mounted.
  }
  notify()
}

export function clearOutcome() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
  notify()
}

/** The fresh result of this business's last import, or null. */
export function useImportOutcome(businessId: string): ImportOutcome | null {
  const raw = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    () => null,
  )
  return useMemo(
    () => parseOutcome(raw, Date.now(), businessId),
    [raw, businessId],
  )
}
