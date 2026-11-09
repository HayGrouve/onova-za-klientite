// @vitest-environment edge-runtime
import { Webhook } from 'standardwebhooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OWNER, setupBusiness, setupConvex } from './test.setup'
import type { TestConvex } from './test.setup'

const SECRET = 'whsec_' + btoa('clerk-endpoint-secret-for-tests')

afterEach(() => {
  vi.unstubAllEnvs()
})

function userDeleted(userId: string) {
  return JSON.stringify({
    type: 'user.deleted',
    object: 'event',
    data: { id: userId, object: 'user', deleted: true },
  })
}

/** Posts to the endpoint the way Svix does (Standard Webhooks signature). */
async function deliver(
  t: TestConvex,
  body: string,
  options: { id?: string; secret?: string } = {},
) {
  const id = options.id ?? 'msg_1'
  const now = new Date()
  return await t.fetch('/clerk/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
      'svix-signature': new Webhook(options.secret ?? SECRET).sign(
        id,
        now,
        body,
      ),
    },
    body,
  })
}

async function counts(t: TestConvex) {
  return await t.run(async (ctx) => ({
    users: (await ctx.db.query('users').collect()).length,
    businesses: (await ctx.db.query('businesses').collect()).length,
    events: (await ctx.db.query('webhookEvents').collect()).length,
  }))
}

describe('POST /clerk/webhook', () => {
  it('answers 503 while the signing secret is unset', async () => {
    const t = setupConvex()
    await setupBusiness(t)
    const response = await deliver(t, userDeleted(OWNER.subject))
    expect(response.status).toBe(503)
    expect(await counts(t)).toEqual({ users: 1, businesses: 1, events: 0 })
  })

  it('rejects a bad signature with 400 and erases nothing', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', SECRET)
    const t = setupConvex()
    await setupBusiness(t)
    const response = await deliver(t, userDeleted(OWNER.subject), {
      secret: 'whsec_' + btoa('someone-else'),
    })
    expect(response.status).toBe(400)
    expect(await counts(t)).toEqual({ users: 1, businesses: 1, events: 0 })
  })

  it('erases a known subject with the same erase as Изтрий данните', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', SECRET)
    const t = setupConvex()
    await setupBusiness(t)
    const response = await deliver(t, userDeleted(OWNER.subject))
    expect(response.status).toBe(200)
    // The user row goes in the same mutation; the business in batches.
    expect((await counts(t)).users).toBe(0)
    await t.finishAllScheduledFunctions(() => {})
    await t.finishAllScheduledFunctions(() => {})
    expect(await counts(t)).toEqual({ users: 0, businesses: 0, events: 1 })
  })

  it('handles a replayed svix-id once', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', SECRET)
    const t = setupConvex()
    await deliver(t, userDeleted(OWNER.subject), { id: 'msg_replayed' })
    // The same person signs up again, then the old delivery is replayed.
    await setupBusiness(t)
    const replay = await deliver(t, userDeleted(OWNER.subject), {
      id: 'msg_replayed',
    })
    expect(replay.status).toBe(200)
    expect(await counts(t)).toEqual({ users: 1, businesses: 1, events: 1 })
  })

  it('acknowledges an unknown subject and other events without erasing', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', SECRET)
    const t = setupConvex()
    await setupBusiness(t)
    const unknown = await deliver(t, userDeleted('user_never_signed_in'), {
      id: 'msg_unknown',
    })
    const other = await deliver(
      t,
      JSON.stringify({ type: 'user.updated', data: { id: OWNER.subject } }),
      { id: 'msg_other' },
    )
    expect([unknown.status, other.status]).toEqual([200, 200])
    expect(await counts(t)).toEqual({ users: 1, businesses: 1, events: 1 })
  })
})
