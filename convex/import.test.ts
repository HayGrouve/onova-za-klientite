// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  STRANGER,
  addMember,
  expectCachesFresh,
  setupBusiness,
  setupConvex,
} from './test.setup'
import type { TestConvex } from './test.setup'

const row = (name: string, phones: string[] = [], extra = {}) => ({
  name,
  phones,
  extra,
})

async function clientCount(t: TestConvex) {
  return await t.run(
    async (ctx) =>
      (await ctx.db.query('clients').collect()).filter(
        (client) => !client.isNoClient,
      ).length,
  )
}

describe('import.clients', () => {
  it('creates clients with normalized phones, extra values and a lookup row each', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const fieldId = await owner.mutation(api.fields.add, {
      businessId,
      target: 'client',
      name: 'Препоръчан от',
      type: 'text',
    })
    const result = await owner.mutation(api.import.clients, {
      businessId,
      skipDuplicates: false,
      rows: [
        {
          name: 'Иван Петров',
          phones: ['0888 123 456', '+359889654321'],
          email: 'ivan@example.com',
          address: 'ул. Шипка 3',
          note: 'Шкаф',
          extra: { [fieldId]: 'Мария' },
        },
        { ...row('Мебели ООД'), kind: 'company' as const },
      ],
    })
    expect(result).toEqual({ created: 2, skipped: 0 })
    const clients = await t.run((ctx) => ctx.db.query('clients').collect())
    const ivan = clients.find((client) => client.name === 'Иван Петров')!
    expect(ivan.phones.map((phone) => phone.e164)).toEqual([
      '+359888123456',
      '+359889654321',
    ])
    expect(ivan.extra).toEqual({ [fieldId]: 'Мария' })
    expect(ivan.email).toBe('ivan@example.com')
    expect(ivan.searchText).toContain('ivan')
    expect(clients.find((c) => c.name === 'Мебели ООД')?.kind).toBe('company')
    const lookups = await t.run((ctx) => ctx.db.query('clientPhones').collect())
    expect(lookups).toHaveLength(2)
    await expectCachesFresh(t)
  })

  it('skips a row whose phone is already a client, and repeats inside the call', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.clients.create, {
      businessId,
      name: 'Стар',
      phones: [{ number: '0888 123 456' }],
    })
    const rows = [
      row('Същият', ['+359 888 123 456']),
      row('Нов', ['0887 111 222']),
      row('Нов втори', ['0887 111 222']),
      row('Без телефон'),
    ]
    expect(
      await owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: true,
        rows,
      }),
    ).toEqual({ created: 2, skipped: 2 })
    expect(await clientCount(t)).toBe(3)
    // Without the switch, everything goes in.
    expect(
      await owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: false,
        rows,
      }),
    ).toEqual({ created: 4, skipped: 0 })
  })

  it('takes 100 rows in one call and no more', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        row(`Клиент ${i}`, [
          `0888 ${String(100000 + i).replace(/(\d{3})/, '$1 ')}`,
        ]),
      )
    expect(
      await owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: true,
        rows: many(100),
      }),
    ).toEqual({ created: 100, skipped: 0 })
    await expect(
      owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: true,
        rows: many(101),
      }),
    ).rejects.toThrow(/invalid/)
    expect(await clientCount(t)).toBe(100)
  })

  it('writes nothing when a row is invalid', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await expect(
      owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: false,
        rows: [row('Добър'), row('Лош', ['12'])],
      }),
    ).rejects.toThrow(/invalid/)
    expect(await clientCount(t)).toBe(0)
  })

  it("refuses extra values for a field that is not the business's", async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const other = await setupBusiness(t, STRANGER)
    const foreign = await other.owner.mutation(api.fields.add, {
      businessId: other.businessId,
      target: 'client',
      name: 'Чуждо',
      type: 'text',
    })
    await expect(
      owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: false,
        rows: [row('Иван', [], { [foreign]: 'x' })],
      }),
    ).rejects.toThrow(/field.value/)
  })

  it('is for managers and owners, not workers', async () => {
    const t = setupConvex()
    const b = await setupBusiness(t)
    const { member: worker } = await addMember(t, b, 'worker')
    const { member: manager } = await addMember(t, b, 'manager')
    const args = { businessId: b.businessId, skipDuplicates: false }
    await expect(
      worker.mutation(api.import.clients, { ...args, rows: [row('А')] }),
    ).rejects.toThrow(/auth.forbidden/)
    await expect(
      worker.query(api.import.duplicatesByPhone, {
        businessId: b.businessId,
        phones: [],
      }),
    ).rejects.toThrow(/auth.forbidden/)
    expect(
      await manager.mutation(api.import.clients, { ...args, rows: [row('А')] }),
    ).toEqual({ created: 1, skipped: 0 })
  })
})

describe('import.duplicatesByPhone', () => {
  it('returns the numbers that already belong to a client, of this business only', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const other = await setupBusiness(t, STRANGER)
    await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван',
      phones: [{ number: '0888 123 456' }],
    })
    await other.owner.mutation(api.clients.create, {
      businessId: other.businessId,
      name: 'Чужд',
      phones: [{ number: '0889 654 321' }],
    })
    expect(
      await owner.query(api.import.duplicatesByPhone, {
        businessId,
        phones: ['+359888123456', '+359889654321', '+359887000000'],
      }),
    ).toEqual(['+359888123456'])
  })

  it('takes at most 500 numbers', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const phones = (count: number) =>
      Array.from(
        { length: count },
        (_, i) => `+3598880${String(i).padStart(5, '0')}`,
      )
    expect(
      await owner.query(api.import.duplicatesByPhone, {
        businessId,
        phones: phones(500),
      }),
    ).toEqual([])
    await expect(
      owner.query(api.import.duplicatesByPhone, {
        businessId,
        phones: phones(501),
      }),
    ).rejects.toThrow(/invalid/)
  })
})

describe('import rate limit', () => {
  it('allows 100 batches at once, then says rate.limited', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    for (let n = 0; n < 100; n++) {
      await owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: false,
        rows: [],
      })
    }
    await expect(
      owner.mutation(api.import.clients, {
        businessId,
        skipDuplicates: false,
        rows: [],
      }),
    ).rejects.toThrow(/rate.limited/)
  })
})
