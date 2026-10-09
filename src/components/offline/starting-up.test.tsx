// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROBE_MS,
  RELOAD_COOLDOWN_MS,
  RELOAD_GRACE_MS,
  restartStartingUpClock,
  StartedUp,
  StartingUp,
  STARTING_UP_MS,
} from './starting-up'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({ load: vi.fn(), reload: vi.fn() }))

vi.mock('#/lib/env', () => ({ convexUrl: 'https://example.convex.cloud' }))
vi.mock('#/lib/offline-store', () => ({ loadLastSnapshot: mocks.load }))
vi.mock('./offline-app', () => ({
  OfflineApp: ({ saved }: { saved: { savedAt: number } | null }) => (
    <div data-testid="offline">{saved ? `saved ${saved.savedAt}` : 'none'}</div>
  ),
}))
vi.mock('#/paraglide/messages.js', () => ({
  m: {
    loading: () => 'loading',
    offline_connection_back: () => 'connection back',
    offline_reload: () => 'reload',
  },
}))

describe('StartingUp', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    restartStartingUpClock()
    sessionStorage.clear()
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
  const spinner = () => container.querySelector('[data-slot=spinner]')

  it('shows the spinner while the app is still starting', async () => {
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS - 1))
    expect(spinner()).not.toBeNull()
    expect(find('offline')).toBeNull()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('names the spinner for a screen reader', () => {
    act(() => root.render(<StartingUp />))
    const label = container.querySelector('[role=status]')
    expect(label?.getAttribute('aria-label')).toBe('loading')
  })

  it('shows the saved copy when the start takes too long (online but no reach)', async () => {
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    expect(find('offline')?.textContent).toBe('saved 7')
    expect(spinner()).toBeNull()
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
    expect(spinner()).not.toBeNull()
    expect(find('offline')).toBeNull()
  })

  it('never starts the timer once it is gone', async () => {
    act(() => root.render(<StartingUp />))
    act(() => root.unmount())
    await vi.advanceTimersByTimeAsync(STARTING_UP_MS * 2)
    expect(mocks.load).not.toHaveBeenCalled()
    root = createRoot(container)
  })

  it('measures the wait from the first mount, not from each one', async () => {
    // The layout swaps StartingUp for another at its next step.
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS - 3000))
    act(() => root.render(<div />))
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(2999))
    expect(find('offline')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(find('offline')?.textContent).toBe('saved 7')
  })

  it('shows the saved copy at once on a later mount after the wait is up', async () => {
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    act(() => root.render(<div />))
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(find('offline')).not.toBeNull()
  })

  it('waits the whole time again once the app has started (a later sign-in)', async () => {
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    // The start finished after all: the app is up.
    act(() => root.render(<StartedUp />))
    // Later in the same page load (signed out and in again): a fresh wait,
    // not the saved copy at once (it may even be another account's).
    act(() => root.render(<StartingUp />))
    await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS - 1))
    expect(find('offline')).toBeNull()
    expect(spinner()).not.toBeNull()
  })

  describe('once the saved copy shows', () => {
    const slowStart = async () => {
      act(() => root.render(<StartingUp />))
      await act(() => vi.advanceTimersByTimeAsync(STARTING_UP_MS + 1))
    }

    const answer = async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null))
      await act(() => vi.advanceTimersByTimeAsync(PROBE_MS))
    }
    const stampAgo = (ms: number) =>
      sessionStorage.setItem(
        'onova.startingUp.reloadedAt',
        String(Date.now() - ms),
      )
    const reloadButton = () => container.querySelector('button')

    it('reloads after the grace once the server answers again', async () => {
      await slowStart()
      await answer()
      expect(fetch).toHaveBeenCalledWith(
        'https://example.convex.cloud/version',
        expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
      )
      // Not at once: the real start gets the grace to finish.
      expect(mocks.reload).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(RELOAD_GRACE_MS - 1))
      expect(mocks.reload).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(mocks.reload).toHaveBeenCalledTimes(1)
    })

    it('does not reload when the app finishes starting during the grace', async () => {
      await slowStart()
      await answer()
      act(() => root.unmount())
      await vi.advanceTimersByTimeAsync(RELOAD_GRACE_MS * 2)
      expect(mocks.reload).not.toHaveBeenCalled()
      root = createRoot(container)
    })

    it('stops asking once the server has answered', async () => {
      await slowStart()
      await answer()
      const asked = vi.mocked(fetch).mock.calls.length
      await act(() => vi.advanceTimersByTimeAsync(PROBE_MS * 3))
      expect(vi.mocked(fetch).mock.calls.length).toBe(asked)
    })

    it('reloads again once the cooldown has passed', async () => {
      await slowStart()
      stampAgo(RELOAD_COOLDOWN_MS + PROBE_MS)
      await answer()
      await act(() => vi.advanceTimersByTimeAsync(RELOAD_GRACE_MS))
      expect(mocks.reload).toHaveBeenCalledTimes(1)
    })

    it('stamps a reload it makes, so the next page load does not repeat it', async () => {
      await slowStart()
      await answer()
      await act(() => vi.advanceTimersByTimeAsync(RELOAD_GRACE_MS))
      expect(sessionStorage.getItem('onova.startingUp.reloadedAt')).toBe(
        String(Date.now()),
      )
    })

    it('after a reload in the last 2 minutes, offers the reload instead of doing it', async () => {
      await slowStart()
      stampAgo(10_000)
      expect(reloadButton()).toBeNull()
      await answer()
      await act(() => vi.advanceTimersByTimeAsync(RELOAD_GRACE_MS * 4))
      expect(mocks.reload).not.toHaveBeenCalled()
      expect(container.textContent).toContain('connection back')
      expect(find('offline')).not.toBeNull()
      act(() => reloadButton()!.click())
      expect(mocks.reload).toHaveBeenCalledTimes(1)
    })

    it('offers the reload when it cannot remember a reload', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      await slowStart()
      await answer()
      await act(() => vi.advanceTimersByTimeAsync(RELOAD_GRACE_MS * 2))
      expect(mocks.reload).not.toHaveBeenCalled()
      expect(reloadButton()).not.toBeNull()
      vi.restoreAllMocks()
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
