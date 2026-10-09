// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartingUp, STARTING_UP_MS, PROBE_MS } from './starting-up'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({ load: vi.fn(), reload: vi.fn() }))

vi.mock('#/lib/env', () => ({ convexUrl: 'https://example.convex.cloud' }))
vi.mock('#/lib/offline-store', () => ({ loadLastSnapshot: mocks.load }))
vi.mock('./offline-app', () => ({
  OfflineApp: ({ saved }: { saved: { savedAt: number } | null }) => (
    <div data-testid="offline">{saved ? `saved ${saved.savedAt}` : 'none'}</div>
  ),
}))
vi.mock('#/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))
vi.mock('#/paraglide/messages.js', () => ({ m: { loading: () => 'loading' } }))

describe('StartingUp', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
    mocks.reload.mockReset()
    vi.stubGlobal('location', { ...window.location, reload: mocks.reload })
    mocks.load.mockReset().mockResolvedValue({ savedAt: 7, data: {} })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const find = (id: string) => container.querySelector(`[data-testid=${id}]`)

  it('shows the spinner while the app is still starting', async () => {
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS - 1))
    expect(find('spinner')).not.toBeNull()
    expect(find('offline')).toBeNull()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('shows the saved copy when the start takes too long (online but no reach)', async () => {
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    expect(find('offline')?.textContent).toBe('saved 7')
    expect(find('spinner')).toBeNull()
  })

  it('says there is nothing saved when there is no copy', async () => {
    mocks.load.mockResolvedValue(null)
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    expect(find('offline')?.textContent).toBe('none')
  })

  it('keeps the spinner until the copy has been read', async () => {
    mocks.load.mockReturnValue(new Promise(() => {}))
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    expect(find('spinner')).not.toBeNull()
    expect(find('offline')).toBeNull()
  })

  it('never starts the timer once it is gone', async () => {
    act(() => root.render(<StartingUp />))
    act(() => root.unmount())
    await vi.advanceTimersByTimeAsync(STARTING_UP_MS * 2)
    expect(mocks.load).not.toHaveBeenCalled()
    root = createRoot(container)
  })

  describe('once the saved copy shows', () => {
    const slowStart = async () => {
      act(() => root.render(<StartingUp />))
      await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    }

    it('reloads when the server answers again', async () => {
      await slowStart()
      vi.mocked(fetch).mockResolvedValue(new Response(null))
      await act(() => vi.advanceTimersByTimeAsync(PROBE_MS))
      expect(fetch).toHaveBeenCalledWith(
        'https://example.convex.cloud/version',
        expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
      )
      expect(mocks.reload).toHaveBeenCalledTimes(1)
    })

    it('keeps the copy and asks again while there is no answer', async () => {
      await slowStart()
      vi.mocked(fetch).mockRejectedValue(new TypeError('offline'))
      await act(() => vi.advanceTimersByTimeAsync(PROBE_MS * 3))
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(3)
      expect(mocks.reload).not.toHaveBeenCalled()
      expect(find('offline')).not.toBeNull()
    })

    it('does not ask before the copy shows', async () => {
      act(() => root.render(<StartingUp />))
      await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS - 1))
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
