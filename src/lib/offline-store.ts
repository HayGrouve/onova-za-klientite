import { clear, get, set } from 'idb-keyval'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'

export type Snapshot = FunctionReturnType<typeof api.offline.snapshot>

export type SavedSnapshot = { savedAt: number; data: Snapshot }

const LAST_USER = 'offline:lastUser'
const key = (userId: string) => `offline:snapshot:${userId}`

/** Keeps the latest snapshot per signed-in user (ADR 0010). */
export async function saveSnapshot(userId: string, data: Snapshot) {
  await set(key(userId), { savedAt: Date.now(), data } satisfies SavedSnapshot)
  await set(LAST_USER, userId)
}

/** The last signed-in user's snapshot: offline, Clerk can't tell us who is signed in. */
export async function loadLastSnapshot(): Promise<SavedSnapshot | null> {
  try {
    const userId = await get<string>(LAST_USER)
    if (!userId) return null
    return (await get<SavedSnapshot>(key(userId))) ?? null
  } catch {
    return null
  }
}

/** On sign-out the copy of personal data leaves the phone. */
export async function wipeSnapshots() {
  try {
    await clear()
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

/** Asks the browser not to evict the snapshot under storage pressure. */
export async function persistStorage() {
  try {
    await navigator.storage.persist()
  } catch {
    // Best effort.
  }
}
