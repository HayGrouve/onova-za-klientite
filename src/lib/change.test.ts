// @vitest-environment jsdom
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { runChange } from './change'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const online = (value: boolean) =>
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)

afterEach(() => vi.restoreAllMocks())

describe('runChange', () => {
  it('runs the change and hands back its result', async () => {
    online(true)
    await expect(runChange(async () => 7)).resolves.toEqual({
      done: true,
      value: 7,
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('runs nothing offline, and says so', async () => {
    online(false)
    const action = vi.fn(async () => 7)
    await expect(runChange(action)).resolves.toEqual({ done: false })
    expect(action).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledOnce()
  })

  it('shows a failure instead of throwing it', async () => {
    online(true)
    await expect(
      runChange(async () => {
        throw new ConvexError({ code: 'credit.notEnough' })
      }),
    ).resolves.toEqual({ done: false })
    expect(toast.error).toHaveBeenCalledOnce()
  })
})
