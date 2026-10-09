// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { setupBusiness, setupConvex } from './test.setup'

describe('businesses.createAnother', () => {
  it('allows 5 a day, then says rate.limited', async () => {
    const t = setupConvex()
    const { owner } = await setupBusiness(t)
    for (let n = 0; n < 5; n++) {
      await owner.mutation(api.businesses.createAnother, {})
    }
    await expect(
      owner.mutation(api.businesses.createAnother, {}),
    ).rejects.toThrow(/rate.limited/)
    expect(
      await t.run((ctx) => ctx.db.query('businesses').collect()),
    ).toHaveLength(6)
  })
})
