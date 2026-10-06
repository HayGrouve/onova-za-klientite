// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { OWNER, STRANGER, setupConvex } from './test.setup'

afterEach(() => {
  vi.unstubAllEnvs()
})

async function snapshot(t: ReturnType<typeof setupConvex>) {
  return await t.run(async (ctx) => {
    const strip = <T extends { _id: string; _creationTime: number }>(
      docs: T[],
    ) => docs.map(({ _id, _creationTime, ...rest }) => rest)
    return {
      businesses: (await ctx.db.query('businesses').collect())
        .map((b) => b.name)
        .sort(),
      stages: (await ctx.db.query('stages').collect()).length,
      services: strip(await ctx.db.query('services').collect())
        .map((s) => s.name)
        .sort(),
      clients: (await ctx.db.query('clients').collect())
        .map((c) => c.name)
        .sort(),
      items: (await ctx.db.query('items').collect()).length,
      phones: (await ctx.db.query('clientPhones').collect()).length,
      fields: (await ctx.db.query('fields').collect()).length,
    }
  })
}

describe('seed:dev', () => {
  it('refuses to run without ALLOW_SEED (production)', async () => {
    const t = setupConvex()
    await expect(t.mutation(internal.seed.dev, {})).rejects.toThrow(
      /seed.notAllowed/,
    )
  })

  it('running it twice gives the same result', async () => {
    vi.stubEnv('ALLOW_SEED', 'true')
    const t = setupConvex()
    await t.withIdentity(OWNER).mutation(api.users.ensureCurrent, {})
    const first = await t.mutation(internal.seed.dev, {})
    const before = await snapshot(t)
    const second = await t.mutation(internal.seed.dev, {})
    expect(second).toEqual(first)
    expect(await snapshot(t)).toEqual(before)
    expect(before.businesses).toEqual([
      'Мебели Стоянов',
      'Моят бизнес',
      'Хладина Сервиз',
    ])
    expect(before.items).toBeGreaterThan(0)
  })

  it('every user, existing and new, joins both seed businesses', async () => {
    vi.stubEnv('ALLOW_SEED', 'true')
    const t = setupConvex()
    await t.withIdentity(OWNER).mutation(api.users.ensureCurrent, {})
    await t.mutation(internal.seed.dev, {})
    await t.withIdentity(STRANGER).mutation(api.users.ensureCurrent, {})

    for (const identity of [OWNER, STRANGER]) {
      const viewer = await t.withIdentity(identity).query(api.users.viewer, {})
      const names = viewer?.businesses.map((business) => business.name)
      expect(names).toContain('Мебели Стоянов')
      expect(names).toContain('Хладина Сервиз')
      // Their own business stays the active one.
      expect(viewer?.business?.name).toBe('Моят бизнес')
    }
  })
})
