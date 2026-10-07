// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { getDoc, lastActivity, setupBusiness, setupConvex } from './test.setup'

describe('clients', () => {
  it('phones are stored in international format, with a lookup row each', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван Петров',
      phones: [{ number: '0888 123 456' }, { number: '+359888123456' }],
    })
    const client = await getDoc(t, 'clients', clientId)
    expect(client.phones).toEqual([{ e164: '+359888123456' }])
    const rows = await t.run((ctx) =>
      ctx.db
        .query('clientPhones')
        .withIndex('by_client', (q) => q.eq('clientId', clientId))
        .collect(),
    )
    expect(rows.map((row) => row.e164)).toEqual(['+359888123456'])
    expect((await lastActivity(t)).type).toBe('client.created')
    await expect(
      owner.mutation(api.clients.create, {
        businessId,
        name: 'X',
        phones: [{ number: '123' }],
      }),
    ).rejects.toThrow(/invalid/)
  })

  it('"No client" is built in and cannot be renamed', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    await expect(
      owner.mutation(api.clients.update, {
        businessId,
        clientId: noClientId,
        name: 'Иван',
      }),
    ).rejects.toThrow(/client.noClient/)
    expect((await getDoc(t, 'clients', noClientId)).isNoClient).toBe(true)
  })

  it('renaming a client updates the search keys of their jobs', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Шкаф',
    })
    await owner.mutation(api.clients.update, {
      businessId,
      clientId,
      name: 'Георги',
    })
    expect((await getDoc(t, 'jobs', jobId)).searchText).toContain('georgi')
    expect((await lastActivity(t)).type).toBe('client.edited')
  })
})
