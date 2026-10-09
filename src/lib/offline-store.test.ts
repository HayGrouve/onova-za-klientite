import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

vi.mock('idb-keyval', () => ({
  get: (key: string) => Promise.resolve(store.get(key)),
  set: (key: string, value: unknown) => {
    store.set(key, value)
    return Promise.resolve()
  },
  clear: () => {
    store.clear()
    return Promise.resolve()
  },
}))

const { loadLastSnapshot, saveSnapshot, wipeSnapshots } =
  await import('./offline-store')

const snapshot = (name: string) =>
  ({ businessName: name }) as unknown as Parameters<typeof saveSnapshot>[1]

describe('offline snapshot store', () => {
  beforeEach(() => store.clear())

  it('loads what the last user saved', async () => {
    await saveSnapshot('user_a', snapshot('A'))
    const saved = await loadLastSnapshot()
    expect(saved?.data.businessName).toBe('A')
  })

  it("wipes the previous user's copy when another user saves", async () => {
    await saveSnapshot('user_a', snapshot('A'))
    await saveSnapshot('user_b', snapshot('B'))
    expect([...store.keys()].sort()).toEqual([
      'offline:lastUser',
      'offline:snapshot:user_b',
    ])
    expect((await loadLastSnapshot())?.data.businessName).toBe('B')
  })

  it('keeps the copy when the same user saves again', async () => {
    await saveSnapshot('user_a', snapshot('A'))
    await saveSnapshot('user_a', snapshot('A2'))
    expect((await loadLastSnapshot())?.data.businessName).toBe('A2')
  })

  it('leaves nothing after a wipe', async () => {
    await saveSnapshot('user_a', snapshot('A'))
    await wipeSnapshots()
    expect(await loadLastSnapshot()).toBeNull()
  })
})
