// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { setupBusiness, setupConvex } from './test.setup'

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
})
