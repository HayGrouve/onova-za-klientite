// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { OWNER, STRANGER, setupConvex } from './test.setup'

describe('users.ensureCurrent', () => {
  it('a new user lands in their own business', async () => {
    const t = setupConvex()
    const owner = t.withIdentity(OWNER)
    const userId = await owner.mutation(api.users.ensureCurrent, {})

    const { user, memberships, stages, clients } = await t.run(async (ctx) => ({
      user: await ctx.db.get('users', userId),
      memberships: await ctx.db.query('memberships').collect(),
      stages: await ctx.db.query('stages').collect(),
      clients: await ctx.db.query('clients').collect(),
    }))

    expect(user?.name).toBe(OWNER.name)
    expect(user?.clerkUserId).toBe(OWNER.subject)
    expect(memberships).toHaveLength(1)
    expect(memberships[0]).toMatchObject({ userId, role: 'owner' })
    expect(user?.activeBusinessId).toBe(memberships[0].businessId)

    const groups = new Set(stages.map((stage) => stage.group))
    expect(groups).toEqual(new Set(['new', 'in_progress', 'done', 'cancelled']))

    expect(clients).toHaveLength(1)
    expect(clients[0].isNoClient).toBe(true)
    const business = await t.run((ctx) =>
      ctx.db.get('businesses', memberships[0].businessId),
    )
    expect(business?.noClientId).toBe(clients[0]._id)
  })

  it('signing in again creates nothing new', async () => {
    const t = setupConvex()
    const owner = t.withIdentity(OWNER)
    const first = await owner.mutation(api.users.ensureCurrent, {})
    const second = await owner.mutation(api.users.ensureCurrent, {})
    expect(second).toBe(first)
    const businesses = await t.run((ctx) =>
      ctx.db.query('businesses').collect(),
    )
    expect(businesses).toHaveLength(1)
  })

  it('keeps the profile in step with Clerk', async () => {
    const t = setupConvex()
    const userId = await t
      .withIdentity(OWNER)
      .mutation(api.users.ensureCurrent, {})
    await t
      .withIdentity({ ...OWNER, name: 'Иван С.' })
      .mutation(api.users.ensureCurrent, {})
    const user = await t.run((ctx) => ctx.db.get('users', userId))
    expect(user?.name).toBe('Иван С.')
  })

  it('refuses a signed-out caller', async () => {
    const t = setupConvex()
    await expect(t.mutation(api.users.ensureCurrent, {})).rejects.toThrow(
      /auth.signedOut/,
    )
  })
})

describe('users.viewer', () => {
  it('is null when signed out or before ensureCurrent', async () => {
    const t = setupConvex()
    expect(await t.query(api.users.viewer, {})).toBeNull()
    expect(await t.withIdentity(OWNER).query(api.users.viewer, {})).toBeNull()
  })

  it('returns the active business and its words', async () => {
    const t = setupConvex()
    const owner = t.withIdentity(OWNER)
    await owner.mutation(api.users.ensureCurrent, {})
    const viewer = await owner.query(api.users.viewer, {})
    expect(viewer?.businesses).toHaveLength(1)
    expect(viewer?.business?.words.job.plural).toBe('Поръчки')
    expect(viewer?.business?._id).toBe(viewer?.businesses[0]._id)
  })
})

describe('users.setActiveBusiness', () => {
  it("a stranger can't switch to someone else's business", async () => {
    const t = setupConvex()
    await t.withIdentity(OWNER).mutation(api.users.ensureCurrent, {})
    const viewer = await t.withIdentity(OWNER).query(api.users.viewer, {})
    const stranger = t.withIdentity(STRANGER)
    await stranger.mutation(api.users.ensureCurrent, {})
    await expect(
      stranger.mutation(api.users.setActiveBusiness, {
        businessId: viewer!.business!._id,
      }),
    ).rejects.toThrow(/auth.notMember/)
  })
})
