// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { setupBusiness, setupConvex, STRANGER } from './test.setup'

// The job, client and item pages take their id from the address bar, so any
// text can arrive. Every kind of wrong id has to give the same coded
// `notFound` (D16), which the page turns into "not found" with a way back.
async function withRecords() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Иван Петров',
    phones: [],
  })
  const jobId = await b.owner.mutation(api.jobs.create, {
    businessId: b.businessId,
    clientId,
    title: 'Гардероб',
  })
  const itemId = await b.owner.mutation(api.items.create, {
    businessId: b.businessId,
    clientId,
    name: 'Стая',
  })
  return { t, ...b, clientId, jobId, itemId }
}

describe('the job, client and item pages', () => {
  it('open for a real id', async () => {
    const { owner, businessId, clientId, jobId, itemId } = await withRecords()
    expect(
      (await owner.query(api.jobs.get, { businessId, jobId })).job._id,
    ).toBe(jobId)
    expect(
      (await owner.query(api.clients.get, { businessId, clientId })).client._id,
    ).toBe(clientId)
    expect(
      (await owner.query(api.items.get, { businessId, itemId })).item._id,
    ).toBe(itemId)
  })

  it('answer notFound for text that is not an id', async () => {
    const { owner, businessId } = await withRecords()
    for (const bad of ['nope', '123', '', 'jd7' + 'x'.repeat(40)]) {
      await expect(
        owner.query(api.jobs.get, { businessId, jobId: bad }),
      ).rejects.toThrow(/notFound/)
      await expect(
        owner.query(api.clients.get, {
          businessId,
          clientId: bad,
        }),
      ).rejects.toThrow(/notFound/)
      await expect(
        owner.query(api.items.get, { businessId, itemId: bad }),
      ).rejects.toThrow(/notFound/)
    }
  })

  it('answer notFound for the id of a different kind of record', async () => {
    const { owner, businessId, clientId, jobId } = await withRecords()
    await expect(
      owner.query(api.jobs.get, { businessId, jobId: clientId }),
    ).rejects.toThrow(/notFound/)
    await expect(
      owner.query(api.clients.get, { businessId, clientId: jobId }),
    ).rejects.toThrow(/notFound/)
  })

  it("answer notFound for another business's record", async () => {
    const { t, jobId, clientId, itemId } = await withRecords()
    const stranger = await setupBusiness(t, STRANGER)
    const { owner, businessId } = stranger
    await expect(
      owner.query(api.jobs.get, { businessId, jobId }),
    ).rejects.toThrow(/notFound/)
    await expect(
      owner.query(api.clients.get, { businessId, clientId }),
    ).rejects.toThrow(/notFound/)
    await expect(
      owner.query(api.items.get, { businessId, itemId }),
    ).rejects.toThrow(/notFound/)
  })
})
