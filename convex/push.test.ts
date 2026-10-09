// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush from 'web-push'
import { api, internal } from './_generated/api'
import { collectDueSummaries } from './lib/summary'
import { STRANGER, setupBusiness, setupConvex, getDoc } from './test.setup'
import type { TestBusiness, TestConvex } from './test.setup'

const enqueueAction = vi.hoisted(() => vi.fn())
vi.mock('@convex-dev/workpool', () => ({
  Workpool: class {
    enqueueAction = enqueueAction
  },
}))
vi.mock('web-push', () => ({
  default: { sendNotification: vi.fn() },
}))

beforeEach(() => {
  enqueueAction.mockReset()
  vi.mocked(webpush.sendNotification).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

const sub = (n: number, auth = 'auth') => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  keys: { p256dh: `p256dh-${n}`, auth },
})

async function nextSummaryAt(t: TestConvex, b: TestBusiness) {
  const members = await t.run((ctx) => ctx.db.query('memberships').collect())
  return members.find((member) => member.businessId === b.businessId)
    ?.nextSummaryAt
}

async function subscribedBusiness(now = '2026-10-25T10:00:00Z') {
  at(now)
  const t = setupConvex()
  const b = await setupBusiness(t)
  await b.owner.mutation(api.push.subscribe, sub(1))
  return { t, b }
}

describe('nextSummaryAt lands on 07:30 in Sofia', () => {
  it.each([
    // Summer time before the autumn changeover on 25 Oct 2026: UTC+3.
    ['2026-10-23T10:00:00Z', '2026-10-24T04:30:00Z'],
    // The night of the changeover: 07:30 is already winter time, UTC+2.
    ['2026-10-24T10:00:00Z', '2026-10-25T05:30:00Z'],
    ['2026-10-25T10:00:00Z', '2026-10-26T05:30:00Z'],
    // Before 07:30 the same day.
    ['2026-10-26T03:00:00Z', '2026-10-26T05:30:00Z'],
    // Spring, 29 Mar 2026: winter before, summer after.
    ['2026-03-27T10:00:00Z', '2026-03-28T05:30:00Z'],
    ['2026-03-28T10:00:00Z', '2026-03-29T04:30:00Z'],
    ['2026-03-29T10:00:00Z', '2026-03-30T04:30:00Z'],
  ])('subscribing at %s sets %s', async (now, expected) => {
    const { t, b } = await subscribedBusiness(now)
    expect(await nextSummaryAt(t, b)).toBe(new Date(expected).getTime())
  })

  it('moves on to the next 07:30 across the changeover', async () => {
    const { t, b } = await subscribedBusiness('2026-10-24T10:00:00Z')
    // 05:30 UTC on the 25th is 07:30 in Sofia, after the clocks went back.
    at('2026-10-25T05:31:00Z')
    await t.run((ctx) => collectDueSummaries(ctx, Date.now()))
    expect(await nextSummaryAt(t, b)).toBe(
      new Date('2026-10-26T05:30:00Z').getTime(),
    )
  })
})

describe('subscribe', () => {
  it('is idempotent per endpoint and keeps the first schedule', async () => {
    const { t, b } = await subscribedBusiness()
    const first = await nextSummaryAt(t, b)
    at('2026-10-25T12:00:00Z')
    await b.owner.mutation(api.push.subscribe, sub(1, 'new-auth'))
    const rows = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].keys.auth).toBe('new-auth')
    expect(await nextSummaryAt(t, b)).toBe(first)
    await b.owner.mutation(api.push.subscribe, sub(2))
    expect(
      await t.run((ctx) => ctx.db.query('pushSubscriptions').collect()),
    ).toHaveLength(2)
  })

  it('rejects an endpoint that is not https', async () => {
    const { b } = await subscribedBusiness()
    await expect(
      b.owner.mutation(api.push.subscribe, {
        ...sub(3),
        endpoint: 'http://push.example.com/x',
      }),
    ).rejects.toThrow(/invalid/)
  })

  it('does not schedule a membership with the summary off', async () => {
    at('2026-10-25T10:00:00Z')
    const t = setupConvex()
    const b = await setupBusiness(t)
    await b.owner.mutation(api.push.setNotify, {
      businessId: b.businessId,
      morningSummary: false,
    })
    await b.owner.mutation(api.push.subscribe, sub(1))
    expect(await nextSummaryAt(t, b)).toBeUndefined()
  })
})

describe('unsubscribe', () => {
  it('removes only the caller’s own subscription, and unschedules at none', async () => {
    const { t, b } = await subscribedBusiness()
    const stranger = await setupBusiness(t, STRANGER)
    await stranger.owner.mutation(api.push.unsubscribe, {
      endpoint: sub(1).endpoint,
    })
    expect(
      await t.run((ctx) => ctx.db.query('pushSubscriptions').collect()),
    ).toHaveLength(1)
    expect(await nextSummaryAt(t, b)).toBeDefined()

    await b.owner.mutation(api.push.unsubscribe, { endpoint: sub(1).endpoint })
    expect(
      await t.run((ctx) => ctx.db.query('pushSubscriptions').collect()),
    ).toHaveLength(0)
    expect(await nextSummaryAt(t, b)).toBeUndefined()
  })
})

describe('settings and setNotify', () => {
  it('shows the caller’s flags and whether a device is subscribed', async () => {
    const { b } = await subscribedBusiness()
    expect(
      await b.owner.query(api.push.settings, { businessId: b.businessId }),
    ).toEqual({
      notify: { morningSummary: true, remindersDue: true, overdue: true },
      subscribed: true,
    })
  })

  it('does not let a stranger read another business’s settings', async () => {
    const { t, b } = await subscribedBusiness()
    const stranger = await setupBusiness(t, STRANGER)
    await expect(
      stranger.owner.query(api.push.settings, { businessId: b.businessId }),
    ).rejects.toThrow(/auth.notMember/)
    await expect(
      stranger.owner.mutation(api.push.setNotify, {
        businessId: b.businessId,
        overdue: false,
      }),
    ).rejects.toThrow(/auth.notMember/)
  })

  it('clears the schedule when the summary goes off and sets it again when on', async () => {
    const { t, b } = await subscribedBusiness()
    const args = { businessId: b.businessId }
    await b.owner.mutation(api.push.setNotify, {
      ...args,
      morningSummary: false,
    })
    expect(await nextSummaryAt(t, b)).toBeUndefined()
    const settings = await b.owner.query(api.push.settings, args)
    expect(settings.notify).toEqual({
      morningSummary: false,
      remindersDue: true,
      overdue: true,
    })
    await b.owner.mutation(api.push.setNotify, {
      ...args,
      morningSummary: true,
    })
    expect(await nextSummaryAt(t, b)).toBe(
      new Date('2026-10-26T05:30:00Z').getTime(),
    )
  })
})

/** An appointment today, an overdue job and an open reminder. */
async function seedDay(t: TestConvex, b: TestBusiness) {
  await t.run(async (ctx) => {
    const business = (await ctx.db.get('businesses', b.businessId))!
    await ctx.db.patch('businesses', b.businessId, {
      modules: { ...business.modules, reminders: true },
    })
  })
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Иван',
  })
  await b.owner.mutation(api.jobs.create, {
    businessId: b.businessId,
    clientId,
    title: 'Гардероб',
    dueDate: '2026-10-20',
  })
  // The visit is on another job: an overdue job with a visit today is shown
  // under the visit, not counted twice.
  const visitJobId = await b.owner.mutation(api.jobs.create, {
    businessId: b.businessId,
    clientId,
    title: 'Маса',
  })
  await b.owner.mutation(api.appointments.add, {
    businessId: b.businessId,
    jobId: visitJobId,
    date: '2026-10-26',
  })
  await t.run((ctx) =>
    ctx.db.insert('reminders', {
      businessId: b.businessId,
      date: '2026-10-26',
      note: 'Обадете се',
      source: 'manual',
      status: 'open',
    }),
  )
}

describe('collectDueSummaries', () => {
  it('advances a membership with nothing to report and sends nothing', async () => {
    const { t, b } = await subscribedBusiness()
    at('2026-10-26T05:31:00Z')
    const messages = await t.run((ctx) => collectDueSummaries(ctx, Date.now()))
    expect(messages).toEqual([])
    expect(await nextSummaryAt(t, b)).toBe(
      new Date('2026-10-27T05:30:00Z').getTime(),
    )
  })

  it('leaves a membership that is not due yet alone', async () => {
    const { t, b } = await subscribedBusiness()
    const before = await nextSummaryAt(t, b)
    at('2026-10-26T05:29:00Z')
    expect(await t.run((ctx) => collectDueSummaries(ctx, Date.now()))).toEqual(
      [],
    )
    expect(await nextSummaryAt(t, b)).toBe(before)
  })

  it('says what is there, in the business’s words, then waits for tomorrow', async () => {
    const { t, b } = await subscribedBusiness()
    await seedDay(t, b)
    at('2026-10-26T05:31:00Z')
    const messages = await t.run((ctx) => collectDueSummaries(ctx, Date.now()))
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe('Срещи: 1 · Закъснели: 1 · Напомняния: 1')
    expect(messages[0].title).toContain('Днес')
    expect(messages[0].url).toBe('/')
    const again = await t.run((ctx) => collectDueSummaries(ctx, Date.now()))
    expect(again).toEqual([])
  })

  it('leaves out the sections the member switched off', async () => {
    const { t, b } = await subscribedBusiness()
    await seedDay(t, b)
    await b.owner.mutation(api.push.setNotify, {
      businessId: b.businessId,
      remindersDue: false,
      overdue: false,
    })
    at('2026-10-26T05:31:00Z')
    const messages = await t.run((ctx) => collectDueSummaries(ctx, Date.now()))
    expect(messages.map((message) => message.body)).toEqual(['Срещи: 1'])
  })

  it('skips a summary that is hours late', async () => {
    const { t, b } = await subscribedBusiness()
    await seedDay(t, b)
    at('2026-10-26T12:00:00Z')
    const messages = await t.run((ctx) => collectDueSummaries(ctx, Date.now()))
    expect(messages).toEqual([])
    expect(await nextSummaryAt(t, b)).toBe(
      new Date('2026-10-27T05:30:00Z').getTime(),
    )
  })

  it('unschedules a membership whose user has no device left', async () => {
    const { t, b } = await subscribedBusiness()
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushSubscriptions').collect()) {
        await ctx.db.delete('pushSubscriptions', row._id)
      }
    })
    at('2026-10-26T05:31:00Z')
    expect(await t.run((ctx) => collectDueSummaries(ctx, Date.now()))).toEqual(
      [],
    )
    expect(await nextSummaryAt(t, b)).toBeUndefined()
  })
})

describe('recordSendResults', () => {
  it('records successes, deletes gone subscriptions and unschedules at none', async () => {
    const { t, b } = await subscribedBusiness()
    await b.owner.mutation(api.push.subscribe, sub(2))
    const rows = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    const [first, second] = rows.map((row) => row._id)

    at('2026-10-26T06:00:00Z')
    await t.mutation(internal.push.recordSendResults, {
      delivered: [first],
      gone: [second],
    })
    expect((await getDoc(t, 'pushSubscriptions', first)).lastSuccessAt).toBe(
      new Date('2026-10-26T06:00:00Z').getTime(),
    )
    expect(
      await t.run((ctx) => ctx.db.get('pushSubscriptions', second)),
    ).toBeNull()
    expect(await nextSummaryAt(t, b)).toBeDefined()

    await t.mutation(internal.push.recordSendResults, {
      delivered: [],
      gone: [first],
    })
    expect(await nextSummaryAt(t, b)).toBeUndefined()
  })
})

describe('subscribe limits', () => {
  it('refuses keys and endpoints that are too long or empty', async () => {
    const { b } = await subscribedBusiness()
    const base = sub(5)
    for (const bad of [
      { ...base, keys: { ...base.keys, p256dh: 'p'.repeat(201) } },
      { ...base, keys: { ...base.keys, auth: 'a'.repeat(101) } },
      { ...base, keys: { ...base.keys, auth: '' } },
      {
        ...base,
        endpoint: `https://fcm.googleapis.com/fcm/send/${'x'.repeat(1000)}`,
      },
    ]) {
      await expect(b.owner.mutation(api.push.subscribe, bad)).rejects.toThrow(
        /invalid/,
      )
    }
  })

  it('allows 10 new devices an hour, then says rate.limited', async () => {
    at('2026-10-25T10:00:00Z')
    const t = setupConvex()
    const b = await setupBusiness(t)
    for (let n = 1; n <= 10; n++) {
      await b.owner.mutation(api.push.subscribe, sub(n))
    }
    await expect(b.owner.mutation(api.push.subscribe, sub(11))).rejects.toThrow(
      /rate.limited/,
    )
    // The app repeats an unchanged subscription on every open: that is free.
    await b.owner.mutation(api.push.subscribe, sub(10))
    at('2026-10-25T11:01:00Z')
    await b.owner.mutation(api.push.subscribe, sub(11))
  })

  it('keeps at most 10 devices per person and drops the oldest', async () => {
    const { t, b } = await subscribedBusiness()
    const userId = await t.run(
      async (ctx) => (await ctx.db.query('users').first())!._id,
    )
    await t.run(async (ctx) => {
      for (let n = 2; n <= 10; n++) {
        await ctx.db.insert('pushSubscriptions', {
          userId,
          ...sub(n),
        })
      }
    })
    const count = () =>
      t.run(async (ctx) => await ctx.db.query('pushSubscriptions').collect())
    expect(await count()).toHaveLength(10)
    await b.owner.mutation(api.push.subscribe, sub(11))
    const rows = await count()
    expect(rows).toHaveLength(10)
    const endpoints = rows.map((row) => row.endpoint)
    expect(endpoints).toContain(sub(11).endpoint)
    expect(endpoints).not.toContain(sub(1).endpoint)
    expect(endpoints).toContain(sub(2).endpoint)
  })
})

describe('pushNode.send', () => {
  const message = { title: 'Днес', body: 'Срещи: 1', url: '/' }

  async function twoDevices() {
    const { t, b } = await subscribedBusiness()
    await b.owner.mutation(api.push.subscribe, sub(2))
    vi.stubEnv('VAPID_PUBLIC_KEY', 'public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com')
    const rows = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    return { t, rows }
  }

  it('sends to the one device it is given and records it', async () => {
    const { t, rows } = await twoDevices()
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)
    await t.action(internal.pushNode.send, {
      subscriptionId: rows[0]._id,
      ...message,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    const after = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    expect(
      after.find((row) => row._id === rows[0]._id)?.lastSuccessAt,
    ).toBeDefined()
    expect(
      after.find((row) => row._id === rows[1]._id)?.lastSuccessAt,
    ).toBeUndefined()
  })

  it('throws on 429 and 5xx so the pool retries just this device', async () => {
    const { t, rows } = await twoDevices()
    for (const statusCode of [429, 503]) {
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode })
      await expect(
        t.action(internal.pushNode.send, {
          subscriptionId: rows[0]._id,
          ...message,
        }),
      ).rejects.toThrow(String(statusCode))
    }
    // Nothing was sent to the other device by those calls.
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    expect(
      vi
        .mocked(webpush.sendNotification)
        .mock.calls.every(([target]) => target.endpoint === sub(1).endpoint),
    ).toBe(true)
  })

  it('deletes a device the service says is gone and does not retry', async () => {
    const { t, rows } = await twoDevices()
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({
      statusCode: 410,
    })
    await t.action(internal.pushNode.send, {
      subscriptionId: rows[0]._id,
      ...message,
    })
    const after = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    expect(after.map((row) => row._id)).toEqual([rows[1]._id])
  })

  it('ignores a bad request (400) without retrying', async () => {
    const { t, rows } = await twoDevices()
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({
      statusCode: 400,
    })
    await t.action(internal.pushNode.send, {
      subscriptionId: rows[0]._id,
      ...message,
    })
    expect(
      await t.run((ctx) => ctx.db.query('pushSubscriptions').collect()),
    ).toHaveLength(2)
  })
})

describe('runDueSummaries', () => {
  it('enqueues one send per device, so a retry repeats only one', async () => {
    const { t, b } = await subscribedBusiness()
    await b.owner.mutation(api.push.subscribe, sub(2))
    await seedDay(t, b)
    at('2026-10-26T05:31:00Z')
    await t.mutation(internal.push.runDueSummaries, {})
    const rows = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    expect(enqueueAction).toHaveBeenCalledTimes(2)
    const targets = enqueueAction.mock.calls.map(
      ([, , args]) => args.subscriptionId,
    )
    expect(targets.sort()).toEqual(rows.map((row) => row._id).sort())
    expect(enqueueAction.mock.calls[0][2].body).toBe(
      'Срещи: 1 · Закъснели: 1 · Напомняния: 1',
    )
  })
})
