// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { STRANGER, getDoc, setupBusiness, setupConvex } from './test.setup'
import type { TestConvex } from './test.setup'

// convex-test fakes search loosely, so the fold itself is tested in
// shared/search.test.ts; this checks the wiring and the business scope.
describe('search.all', () => {
  it('finds clients, jobs and items, only in the caller’s business', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван Петров',
    })
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
    })
    const result = await owner.query(api.search.all, {
      businessId,
      query: 'ivan',
    })
    expect(result.clients.map((client) => client.name)).toContain('Иван Петров')
  })

  it('finds a Cyrillic name by the Latin spelling people type', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария Иванова',
    })
    for (const query of ['Maria', 'Mariya', 'Mariia', 'maria ivanova']) {
      const result = await owner.query(api.search.all, { businessId, query })
      expect(
        result.clients.map((client) => client.name),
        query,
      ).toEqual(['Мария Иванова'])
    }
  })

  it('finds a client by the end, the middle or the national form of a phone', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван Петров',
      phones: [{ number: '0899 314 159' }],
    })
    await owner.mutation(api.clients.create, {
      businessId,
      name: 'Петър Димитров',
      phones: [{ number: '+359 87 655 5666' }],
    })
    const found = async (query: string) =>
      (await owner.query(api.search.all, { businessId, query })).clients.map(
        (client) => client.name,
      )
    expect(await found('4159')).toEqual(['Иван Петров'])
    expect(await found('899314159')).toEqual(['Иван Петров'])
    expect(await found('899 314 159')).toEqual(['Иван Петров'])
    expect(await found('93141')).toEqual(['Иван Петров'])
    expect(await found('0899')).toEqual(['Иван Петров'])
    expect(await found('5566')).toEqual(['Петър Димитров'])
    expect(await found('876555666')).toEqual(['Петър Димитров'])
    expect(await found('7655')).toEqual(['Петър Димитров'])
    expect(await found('4158')).toEqual([])
  })

  it('finds a client and their jobs by street', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Стоян Георгиев',
      address: 'София, кв. Лозенец, ул. Златовръх 12',
    })
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Климатик',
    })
    const other = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани Тодорова',
      address: 'Варна, ж.к. Чайка',
    })
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: other,
      title: 'Хладилник',
      address: 'Варна, ул. Цар Симеон 5',
    })
    for (const query of ['Златовръх', 'Zlatovrah', 'Лозенец']) {
      const result = await owner.query(api.search.all, { businessId, query })
      expect(
        result.clients.map((client) => client.name),
        query,
      ).toEqual(['Стоян Георгиев'])
      expect(
        result.jobs.map((job) => job.title),
        query,
      ).toEqual(['Климатик'])
    }
    const byJobAddress = await owner.query(api.search.all, {
      businessId,
      query: 'Симеон',
    })
    expect(byJobAddress.jobs.map((job) => job.title)).toEqual(['Хладилник'])
  })

  it('an edited address is searchable at once, and the old one is not', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Стоян Георгиев',
      address: 'ул. Златовръх 12',
    })
    await owner.mutation(api.clients.update, {
      businessId,
      clientId,
      address: 'ул. Раковски 3',
    })
    const found = async (query: string) =>
      (await owner.query(api.search.all, { businessId, query })).clients.length
    expect(await found('Раковски')).toBe(1)
    expect(await found('Златовръх')).toBe(0)
  })
})

describe('search:rebuildAll', () => {
  /** Makes every record's searchText as stale as one saved before the new fold. */
  async function makeStale(t: TestConvex) {
    await t.run(async (ctx) => {
      for (const table of ['clients', 'jobs', 'items'] as const) {
        for (const doc of await ctx.db.query(table).collect()) {
          await ctx.db.patch(table, doc._id, { searchText: 'stale' })
        }
      }
    })
  }

  it('rebuilds clients, jobs and items in every business', async () => {
    const t = setupConvex()
    const one = await setupBusiness(t)
    const two = await setupBusiness(t, STRANGER)
    const clientId = await one.owner.mutation(api.clients.create, {
      businessId: one.businessId,
      name: 'Мария Иванова',
      phones: [{ number: '0899 314 159' }],
      address: 'ул. Златовръх 12',
    })
    const jobId = await one.owner.mutation(api.jobs.create, {
      businessId: one.businessId,
      clientId,
      title: 'Климатик',
    })
    const itemId = await one.owner.mutation(api.items.create, {
      businessId: one.businessId,
      clientId,
      name: 'Daikin Юлия',
    })
    const otherClient = await two.owner.mutation(api.clients.create, {
      businessId: two.businessId,
      name: 'Йордан Стоянов',
    })
    await makeStale(t)

    await t.mutation(internal.search.rebuildAll, {})
    await t.finishAllScheduledFunctions(() => {})

    const client = await getDoc(t, 'clients', clientId)
    expect(client.searchText.split(' ')).toEqual(
      expect.arrayContaining(['maria', 'ivanova', '4159', '899314159']),
    )
    expect(client.searchText).toContain('zlatovrah')
    expect((await getDoc(t, 'jobs', jobId)).searchText).toContain('maria')
    expect((await getDoc(t, 'jobs', jobId)).searchText).toContain('klimatik')
    expect((await getDoc(t, 'items', itemId)).searchText).toContain('ulia')
    expect((await getDoc(t, 'clients', otherClient)).searchText).toBe(
      'iordan stoianov',
    )
    const stale = await t.run(async (ctx) => {
      const rows = [
        ...(await ctx.db.query('clients').collect()),
        ...(await ctx.db.query('jobs').collect()),
        ...(await ctx.db.query('items').collect()),
      ]
      return rows.filter((row) => row.searchText === 'stale')
    })
    expect(stale).toEqual([])
  })

  it('runs page after page until every record is done', async () => {
    const t = setupConvex()
    const { businessId } = await setupBusiness(t)
    const ids = await t.run(async (ctx) => {
      const made: Id<'clients'>[] = []
      for (let index = 0; index < 230; index++) {
        made.push(
          await ctx.db.insert('clients', {
            businessId,
            kind: 'person',
            name: `Мария ${index}`,
            isNoClient: false,
            phones: [],
            consent: {},
            extra: {},
            creditCents: 0,
            searchText: 'stale',
          }),
        )
      }
      return made
    })

    await t.mutation(internal.search.rebuildAll, {})
    await t.finishAllScheduledFunctions(() => {})

    const texts = await t.run(async (ctx) =>
      Promise.all(ids.map(async (id) => (await ctx.db.get('clients', id))!)),
    )
    expect(texts.filter((client) => client.searchText === 'stale')).toEqual([])
    expect(texts[229].searchText.split(' ')).toEqual(
      expect.arrayContaining(['maria', '229']),
    )
  })

  it('can be run again: the same keys come out', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Николай Стоянов',
      phones: [{ number: '+359887123456' }],
    })
    const before = (await getDoc(t, 'clients', clientId)).searchText
    await t.mutation(internal.search.rebuildAll, {})
    await t.finishAllScheduledFunctions(() => {})
    await t.mutation(internal.search.rebuildAll, {})
    await t.finishAllScheduledFunctions(() => {})
    expect((await getDoc(t, 'clients', clientId)).searchText).toBe(before)
  })
})
