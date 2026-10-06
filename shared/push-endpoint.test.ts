import { describe, expect, it } from 'vitest'
import { isPushEndpoint } from './push-endpoint'

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://db5p.notify.windows.com/w/?token=x',
  ])('accepts %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com:8443/x',
    'https://user@fcm.googleapis.com/x',
    'https://169.254.169.254/latest',
    'not a url',
  ])('rejects %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false)
  })
})
