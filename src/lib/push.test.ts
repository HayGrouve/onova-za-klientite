// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { dropPushOnSignOut } from './push'

const device = () => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/1',
  unsubscribe: vi.fn().mockResolvedValue(true),
})

describe('dropPushOnSignOut', () => {
  it('removes the device on the server, then unsubscribes the browser', async () => {
    const subscription = device()
    const order: string[] = []
    const removeOnServer = vi.fn(async () => {
      order.push('server')
    })
    subscription.unsubscribe.mockImplementation(async () => {
      order.push('browser')
      return true
    })
    await dropPushOnSignOut(removeOnServer, async () => subscription)
    expect(removeOnServer).toHaveBeenCalledWith(subscription.endpoint)
    expect(order).toEqual(['server', 'browser'])
  })

  it('does nothing when the device has no subscription', async () => {
    const removeOnServer = vi.fn()
    await dropPushOnSignOut(removeOnServer, async () => null)
    expect(removeOnServer).not.toHaveBeenCalled()
  })

  it('still unsubscribes the browser when the server call fails', async () => {
    const subscription = device()
    await dropPushOnSignOut(
      () => Promise.reject(new Error('offline')),
      async () => subscription,
    )
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it('never throws, even when looking up the subscription fails', async () => {
    await expect(
      dropPushOnSignOut(vi.fn(), () => Promise.reject(new Error('no sw'))),
    ).resolves.toBeUndefined()
  })

  it('gives up after the timeout when the server never answers', async () => {
    const subscription = device()
    const started = Date.now()
    await dropPushOnSignOut(
      () => new Promise(() => undefined),
      async () => subscription,
      50,
    )
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
