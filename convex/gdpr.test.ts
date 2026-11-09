// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { ANONYMOUS_CLIENT_NAME } from '../shared/clients'
import { BUSINESS_TABLE_NAMES } from './lib/businessTables'
import {
  OWNER,
  STRANGER,
  expectCachesFresh,
  getDoc,
  setupBusiness,
  setupConvex,
  storeBlob,
} from './test.setup'

const DERIVED = ['jobCounts', 'jobAssignments'] as const

afterEach(() => {
  vi.unstubAllEnvs()
})

async function twoIvans() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const { owner, businessId } = b
  const first = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Иван Петров',
    phones: [{ number: '0888123456' }],
    email: 'ivan@example.com',
  })
  const second = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Иван П.',
    phones: [{ number: '0888 123 456' }, { number: '0899111222' }],
    address: 'София',
  })
  const jobId = await owner.mutation(api.jobs.create, {
    businessId,
    clientId: second,
    title: 'Шкаф',
    typedPriceCents: 30000,
  })
  await owner.mutation(api.payments.addFromJob, {
    businessId,
    jobId,
    amountCents: 40000,
    date: '2026-10-07',
    method: 'cash',
  })
  const itemId = await owner.mutation(api.items.create, {
    businessId,
    clientId: second,
    name: 'Golf',
  })
  await owner.mutation(api.reminders.add, {
    businessId,
    clientId: second,
    date: '2026-12-01',
    note: 'x',
  })
  return { t, ...b, first, second, jobId, itemId }
}

describe('duplicates and merge', () => {
  it('a matching phone is found as a duplicate', async () => {
    const { owner, businessId, first, second } = await twoIvans()
    const found = await owner.query(api.clientsAdmin.findByPhones, {
      businessId,
      phones: ['+359888123456'],
      exceptClientId: second,
    })
    expect(found.map((client) => client._id)).toEqual([first])
  })

  it('merging moves jobs, payments, items and reminders, and recomputes credit', async () => {
    const { t, owner, businessId, first, second, jobId, itemId } =
      await twoIvans()
    expect((await getDoc(t, 'clients', second)).creditCents).toBe(10000)
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: second,
      intoId: first,
    })

    expect((await getDoc(t, 'jobs', jobId)).clientId).toBe(first)
    expect((await getDoc(t, 'items', itemId)).clientId).toBe(first)
    const into = await getDoc(t, 'clients', first)
    expect(into.creditCents).toBe(10000)
    expect(into.phones.map((phone) => phone.e164)).toEqual([
      '+359888123456',
      '+359899111222',
    ])
    expect(into.email).toBe('ivan@example.com')
    expect(into.address).toBe('София')
    const from = await getDoc(t, 'clients', second)
    expect(from.mergedIntoId).toBe(first)
    expect(from.creditCents).toBe(0)
    const reminders = await t.run((ctx) => ctx.db.query('reminders').collect())
    expect(reminders.every((reminder) => reminder.clientId === first)).toBe(
      true,
    )
    const list = await owner.query(api.clients.list, { businessId })
    expect(list.map((client) => client._id)).not.toContain(second)
    await expectCachesFresh(t)
  })

  it('"No client" is never merged', async () => {
    const { owner, businessId, noClientId, first } = await twoIvans()
    await expect(
      owner.mutation(api.clientsAdmin.merge, {
        businessId,
        fromId: noClientId,
        intoId: first,
      }),
    ).rejects.toThrow(/client.noClient/)
  })
})

describe('anonymize (Q11)', () => {
  it('removes name and contacts; the jobs and money of an anonymized client remain', async () => {
    const { t, owner, businessId, second, jobId } = await twoIvans()
    const storageId = await storeBlob(t, 500, 'image/png')
    await owner.mutation(api.files.save, {
      businessId,
      storageId,
      target: { kind: 'client', clientId: second },
    })
    await owner.mutation(api.clientsAdmin.anonymize, {
      businessId,
      clientId: second,
    })

    const client = await getDoc(t, 'clients', second)
    expect(client.name).toBe(ANONYMOUS_CLIENT_NAME)
    expect(client.phones).toEqual([])
    expect(client.address).toBeUndefined()
    expect(client.anonymizedAt).toBeDefined()
    expect(client.creditCents).toBe(10000)
    expect((await getDoc(t, 'jobs', jobId)).paidCents).toBe(30000)
    const { phones, files, activity } = await t.run(async (ctx) => ({
      phones: await ctx.db
        .query('clientPhones')
        .withIndex('by_client', (q) => q.eq('clientId', second))
        .collect(),
      files: await ctx.db.query('files').collect(),
      activity: await ctx.db.query('activity').order('desc').first(),
    }))
    expect(phones).toEqual([])
    expect(files).toEqual([])
    expect(activity?.type).toBe('client.anonymized')
    expect(activity?.data).toEqual({})
    await expectCachesFresh(t)
  })
})

describe('anonymize leaves no name behind (M1)', () => {
  /** Every row of these tables, as text, to look for a name in. */
  async function dump(t: Awaited<ReturnType<typeof twoIvans>>['t']) {
    return await t.run(async (ctx) =>
      JSON.stringify({
        clients: await ctx.db.query('clients').collect(),
        phones: await ctx.db.query('clientPhones').collect(),
        activity: await ctx.db.query('activity').collect(),
      }),
    )
  }

  it("blanks the name in the client's own activity events and keeps the rows", async () => {
    const { t, owner, businessId, second } = await twoIvans()
    await owner.mutation(api.clients.update, {
      businessId,
      clientId: second,
      name: 'Иван Петров-Стоянов',
    })
    const eventsOf = () =>
      t.run((ctx) =>
        ctx.db
          .query('activity')
          .withIndex('by_client', (q) => q.eq('clientId', second))
          .collect(),
      )
    const before = await eventsOf()
    expect(before.some((event) => event.type === 'client.edited')).toBe(true)
    expect(JSON.stringify(before)).toContain('Иван П.')

    await owner.mutation(api.clientsAdmin.anonymize, {
      businessId,
      clientId: second,
    })

    const after = await eventsOf()
    // Every row stays (and the anonymize event is new).
    expect(after).toHaveLength(before.length + 1)
    expect(JSON.stringify(after)).not.toContain('Иван')
    for (const event of after.filter((e) => e.type.startsWith('client.'))) {
      expect(JSON.stringify(event.data)).not.toMatch(/Иван/)
    }
    // Events that are not about the person keep their values.
    const payment = after.find((event) => event.type === 'payment.added')
    expect(payment?.data.amountCents).toBe(40000)
    expect(
      after.find((event) => event.type === 'client.created')?.data,
    ).toEqual({ name: ANONYMOUS_CLIENT_NAME })
  })

  it('blanks the clients that were merged into it, and their phones and events', async () => {
    const { t, owner, businessId, first, second } = await twoIvans()
    // `second` goes into `first`; anonymizing `first` must take both names.
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: second,
      intoId: first,
    })
    await owner.mutation(api.clientsAdmin.anonymize, {
      businessId,
      clientId: first,
    })

    const absorbed = await getDoc(t, 'clients', second)
    expect(absorbed.name).toBe(ANONYMOUS_CLIENT_NAME)
    expect(absorbed.phones).toEqual([])
    expect(absorbed.address).toBeUndefined()
    expect(absorbed.anonymizedAt).toBeDefined()
    expect(absorbed.mergedIntoId).toBe(first)
    expect(absorbed.searchText).not.toMatch(/иван|софия|0899/i)
    const text = await dump(t)
    expect(text).not.toMatch(/Иван|ivan@example|София|0899111222|359899/)
    await expectCachesFresh(t)
  })

  it('follows a chain of merges', async () => {
    const { t, owner, businessId, first, second } = await twoIvans()
    const third = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Йоан Петров',
    })
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: second,
      intoId: first,
    })
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: first,
      intoId: third,
    })
    await owner.mutation(api.clientsAdmin.anonymize, {
      businessId,
      clientId: third,
    })
    expect(await dump(t)).not.toMatch(/Иван|Йоан|ivan@example/)
  })
})

describe('export', () => {
  it('re-reading the export finds every record', async () => {
    const { t, owner, businessId } = await twoIvans()
    const exported = await owner.query(api.dataExport.all, { businessId })
    const counts = await t.run(async (ctx) => {
      const result: Record<string, number> = {}
      for (const table of BUSINESS_TABLE_NAMES) {
        result[table] = (await ctx.db.query(table).collect()).filter(
          (row) => (row as { businessId: string }).businessId === businessId,
        ).length
      }
      return result
    })
    for (const table of BUSINESS_TABLE_NAMES) {
      expect(exported.tables[table]).toHaveLength(counts[table])
    }
    expect(exported.tables.jobs.length).toBeGreaterThan(0)
  })
})

describe('Изтрий данните', () => {
  it('detaches the user at once, erases sole businesses, keeps shared ones', async () => {
    vi.stubEnv('ALLOW_SEED', 'true')
    const { t, owner, businessId } = await twoIvans()
    // A second business both users belong to stays, minus the leaver.
    await t.mutation(internal.seed.dev, {})
    await t.withIdentity(STRANGER).mutation(api.users.ensureCurrent, {})
    await owner.mutation(api.push.subscribe, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/1',
      keys: { p256dh: 'p256dh-1', auth: 'auth' },
    })
    const storageId = await storeBlob(t, 500, 'image/png')
    const { jobId } = await t.run(async (ctx) => ({
      jobId: (await ctx.db
        .query('jobs')
        .withIndex('by_business_group_due', (q) =>
          q.eq('businessId', businessId),
        )
        .first())!._id,
    }))
    await owner.mutation(api.files.save, {
      businessId,
      storageId,
      target: { kind: 'job', jobId },
    })
    const ownerId = (await t.run(async (ctx) =>
      ctx.db
        .query('users')
        .withIndex('by_clerk_user', (q) => q.eq('clerkUserId', OWNER.subject))
        .unique(),
    ))!._id

    await owner.mutation(api.account.deleteMyData, {})

    // Right away, before any batch runs: no user row, no push, no
    // memberships, so the person is cut off everywhere.
    const right = await t.run(async (ctx) => ({
      owner: await ctx.db.get('users', ownerId),
      push: await ctx.db.query('pushSubscriptions').collect(),
      memberships: (await ctx.db.query('memberships').collect()).filter(
        (membership) => membership.userId === ownerId,
      ),
      scheduled: (await ctx.db.system.query('_scheduled_functions').collect())
        .filter((job) => job.state.kind === 'pending')
        .map((job) => job.name),
    }))
    expect(right.owner).toBeNull()
    expect(right.push).toEqual([])
    expect(right.memberships).toEqual([])
    // Only the batched erase is queued: nothing calls Clerk.
    expect(new Set(right.scheduled)).toEqual(new Set(['account:deleteStep']))
    expect(await owner.query(api.users.viewer, {})).toBeNull()

    // Still signed in: the next load starts over with a fresh business.
    await owner.mutation(api.users.ensureCurrent, {})
    const fresh = await owner.query(api.users.viewer, {})
    expect(fresh?.business?._id).toBeDefined()
    expect(fresh?.business?._id).not.toBe(businessId)
    expect(fresh?.business?.setupDone).toBe(false)

    // One step per table: the test scheduler gives up after about twenty
    // steps in a row, so it is asked again for each business.
    for (let round = 0; round < 4; round++) {
      await t.finishAllScheduledFunctions(() => {})
    }

    const left = await t.run(async (ctx) => {
      const result: Record<string, number> = {}
      for (const table of [...BUSINESS_TABLE_NAMES, ...DERIVED]) {
        result[table] = (await ctx.db.query(table).collect()).filter(
          (row) => (row as { businessId: string }).businessId === businessId,
        ).length
      }
      const seeds = (await ctx.db.query('businesses').collect()).filter(
        (business) => business.seedKey,
      )
      const seedMembers = (await ctx.db.query('memberships').collect()).filter(
        (membership) =>
          seeds.some((business) => business._id === membership.businessId),
      )
      return {
        rows: result,
        business: await ctx.db.get('businesses', businessId),
        storage: await ctx.db.system.query('_storage').collect(),
        seeds,
        seedMembers,
        fresh: await ctx.db.get('businesses', fresh!.business!._id),
      }
    })
    expect(Object.values(left.rows).every((count) => count === 0)).toBe(true)
    expect(left.business).toBeNull()
    expect(left.storage).toEqual([])
    // The seed businesses have another member, so they stay, with them.
    expect(left.seeds).toHaveLength(2)
    expect(left.seedMembers.length).toBeGreaterThan(0)
    expect(left.seedMembers.every((member) => member.userId !== ownerId)).toBe(
      true,
    )
    // The eraser never touches the fresh start.
    expect(left.fresh).not.toBeNull()
  })

  it('erases by Clerk subject, and an unknown subject is a no-op', async () => {
    const t = setupConvex()
    const { businessId } = await setupBusiness(t)
    await t.mutation(internal.account.eraseByClerkUserId, {
      clerkUserId: 'user_never_signed_in',
    })
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      1,
    )

    await t.mutation(internal.account.eraseByClerkUserId, {
      clerkUserId: OWNER.subject,
    })
    await t.finishAllScheduledFunctions(() => {})
    await t.finishAllScheduledFunctions(() => {})
    const left = await t.run(async (ctx) => ({
      users: await ctx.db.query('users').collect(),
      business: await ctx.db.get('businesses', businessId),
    }))
    expect(left.users).toEqual([])
    expect(left.business).toBeNull()
  })
})
