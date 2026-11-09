import { Webhook } from 'standardwebhooks'
import { describe, expect, it } from 'vitest'
import { parseClerkEvent, verifyClerkWebhook } from './clerkWebhook'

const secret = 'whsec_' + btoa('clerk-endpoint-secret-for-tests')
const payload = JSON.stringify({
  type: 'user.deleted',
  object: 'event',
  data: { id: 'user_abc', object: 'user', deleted: true },
})
const signedAt = 1_790_000_000
const nowMs = signedAt * 1000

/** Signs like Svix does (Standard Webhooks), so the check is tested against the real scheme. */
function svixHeaders(
  body: string,
  options: { secret?: string; id?: string } = {},
) {
  const id = options.id ?? 'msg_1'
  return {
    id,
    timestamp: String(signedAt),
    signature: new Webhook(options.secret ?? secret).sign(
      id,
      new Date(nowMs),
      body,
    ),
  }
}

describe('verifyClerkWebhook', () => {
  it('accepts a body signed with the endpoint secret', async () => {
    expect(
      await verifyClerkWebhook({
        payload,
        headers: svixHeaders(payload),
        secret,
        nowMs,
      }),
    ).toBe(true)
  })

  it('accepts any matching signature while the secret rotates', async () => {
    const headers = svixHeaders(payload)
    const other = svixHeaders(payload, {
      secret: 'whsec_' + btoa('the-previous-secret'),
    })
    expect(
      await verifyClerkWebhook({
        payload,
        headers: {
          ...headers,
          signature: `${other.signature} ${headers.signature}`,
        },
        secret,
        nowMs,
      }),
    ).toBe(true)
  })

  it('rejects a changed body, another secret, another message id, or missing headers', async () => {
    const headers = svixHeaders(payload)
    const tampered = payload.replace('user_abc', 'user_xyz')
    expect(
      await verifyClerkWebhook({ payload: tampered, headers, secret, nowMs }),
    ).toBe(false)
    expect(
      await verifyClerkWebhook({
        payload,
        headers: svixHeaders(payload, {
          secret: 'whsec_' + btoa('someone-else'),
        }),
        secret,
        nowMs,
      }),
    ).toBe(false)
    expect(
      await verifyClerkWebhook({
        payload,
        headers: { ...headers, id: 'msg_2' },
        secret,
        nowMs,
      }),
    ).toBe(false)
    expect(
      await verifyClerkWebhook({
        payload,
        headers: { id: null, timestamp: null, signature: null },
        secret,
        nowMs,
      }),
    ).toBe(false)
  })

  it('rejects a replay more than five minutes old', async () => {
    expect(
      await verifyClerkWebhook({
        payload,
        headers: svixHeaders(payload),
        secret,
        nowMs: nowMs + 301_000,
      }),
    ).toBe(false)
  })
})

describe('parseClerkEvent', () => {
  it('reads the type and the user id', () => {
    expect(parseClerkEvent(payload)).toEqual({
      type: 'user.deleted',
      userId: 'user_abc',
    })
  })

  it('returns null for a body that is not an event', () => {
    expect(parseClerkEvent('not json')).toBeNull()
    expect(parseClerkEvent(JSON.stringify({ data: {} }))).toBeNull()
  })
})
