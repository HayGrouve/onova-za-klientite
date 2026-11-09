// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import { APP_ORIGIN, OWNER, STRANGER, setupConvex } from './test.setup'

afterEach(() => {
  vi.unstubAllEnvs()
})

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

  it('finds the user by Clerk subject, whatever the issuer', async () => {
    const t = setupConvex()
    const first = await t
      .withIdentity(OWNER)
      .mutation(api.users.ensureCurrent, {})
    // Same subject, another token identifier: still the same user.
    const again = await t
      .withIdentity({
        ...OWNER,
        issuer: 'https://clerk.other.test',
        tokenIdentifier: 'https://clerk.other.test|user_owner',
      })
      .mutation(api.users.ensureCurrent, {})
    expect(again).toBe(first)
    const users = await t.run((ctx) => ctx.db.query('users').collect())
    expect(users).toHaveLength(1)
    expect(users[0].tokenIdentifier).toBeUndefined()
  })

  it('takes the photo from the picture claim', async () => {
    const t = setupConvex()
    const picture = 'https://img.clerk.test/owner.png'
    const userId = await t
      .withIdentity({ ...OWNER, picture })
      .mutation(api.users.ensureCurrent, {})
    const user = await t.run((ctx) => ctx.db.get('users', userId))
    expect(user?.imageUrl).toBe(picture)
    const viewer = await t
      .withIdentity({ ...OWNER, picture })
      .query(api.users.viewer, {})
    expect(viewer?.user.imageUrl).toBe(picture)
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

describe('authorized parties (azp)', () => {
  const OTHER_ORIGIN = 'https://kuhnyata.test'
  const { azp: _azp, ...NO_AZP } = OWNER

  describe('when CLERK_AUTHORIZED_PARTIES is set', () => {
    it('lets in a token asked for by a listed origin', async () => {
      vi.stubEnv('CLERK_AUTHORIZED_PARTIES', `${OTHER_ORIGIN}, ${APP_ORIGIN}/`)
      const t = setupConvex()
      const owner = t.withIdentity(OWNER)
      await owner.mutation(api.users.ensureCurrent, {})
      expect(await owner.query(api.users.viewer, {})).not.toBeNull()
    })

    it('refuses a token from another origin', async () => {
      vi.stubEnv('CLERK_AUTHORIZED_PARTIES', APP_ORIGIN)
      const t = setupConvex()
      const other = t.withIdentity({ ...OWNER, azp: OTHER_ORIGIN })
      await expect(other.mutation(api.users.ensureCurrent, {})).rejects.toThrow(
        /auth.signedOut/,
      )
      expect(await t.run((ctx) => ctx.db.query('users').collect())).toEqual([])
    })

    it('refuses a token without azp', async () => {
      vi.stubEnv('CLERK_AUTHORIZED_PARTIES', APP_ORIGIN)
      const t = setupConvex()
      await expect(
        t.withIdentity(NO_AZP).mutation(api.users.ensureCurrent, {}),
      ).rejects.toThrow(/auth.signedOut/)
    })

    it("hides an existing user's data from a token of another origin", async () => {
      const t = setupConvex()
      await t.withIdentity(OWNER).mutation(api.users.ensureCurrent, {})
      const viewer = await t.withIdentity(OWNER).query(api.users.viewer, {})
      vi.stubEnv('CLERK_AUTHORIZED_PARTIES', APP_ORIGIN)
      const other = t.withIdentity({ ...OWNER, azp: OTHER_ORIGIN })
      expect(await other.query(api.users.viewer, {})).toBeNull()
      await expect(
        other.mutation(api.users.setActiveBusiness, {
          businessId: viewer!.business!._id,
        }),
      ).rejects.toThrow(/auth.signedOut/)
      await expect(
        t.withIdentity(NO_AZP).query(api.users.viewer, {}),
      ).resolves.toBeNull()
    })
  })

  describe('when CLERK_AUTHORIZED_PARTIES is unset', () => {
    it('lets in any azp, or none', async () => {
      const t = setupConvex()
      const first = await t
        .withIdentity({ ...OWNER, azp: OTHER_ORIGIN })
        .mutation(api.users.ensureCurrent, {})
      const second = await t
        .withIdentity(NO_AZP)
        .mutation(api.users.ensureCurrent, {})
      expect(second).toBe(first)
    })

    it('treats a blank value as unset', async () => {
      vi.stubEnv('CLERK_AUTHORIZED_PARTIES', ' , ')
      const t = setupConvex()
      await t.withIdentity(NO_AZP).mutation(api.users.ensureCurrent, {})
      expect(
        await t.withIdentity(NO_AZP).query(api.users.viewer, {}),
      ).not.toBeNull()
    })
  })
})
