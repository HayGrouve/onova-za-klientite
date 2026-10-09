/// <reference types="vite/client" />
// Convex skips files with more than one dot, so this never deploys.
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { expect } from 'vitest'
import schema from './schema'
import { api } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { patchJob } from './lib/ledger'
import {
  computeClientCache,
  computeJobCache,
  computePaymentCache,
} from './lib/recompute'

// Function modules only: tests, this file and `.d.ts` all have extra dots.
export const modules = import.meta.glob([
  './**/*.ts',
  './_generated/*.js',
  '!./**/*.*.ts',
])

export function setupConvex() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t, 'rateLimiter')
  return t
}

export type TestConvex = ReturnType<typeof setupConvex>

export const OWNER = {
  subject: 'user_owner',
  issuer: 'https://clerk.test',
  tokenIdentifier: 'https://clerk.test|user_owner',
  name: 'Иван Стоянов',
  email: 'ivan@example.com',
}

export const STRANGER = {
  subject: 'user_stranger',
  issuer: 'https://clerk.test',
  tokenIdentifier: 'https://clerk.test|user_stranger',
  name: 'Непознат',
  email: 'stranger@example.com',
}

/** A signed-in owner with their own business, as after first sign-in. */
export async function setupBusiness(t: TestConvex, identity = OWNER) {
  const owner = t.withIdentity(identity)
  await owner.mutation(api.users.ensureCurrent, {})
  const viewer = await owner.query(api.users.viewer, {})
  const businessId = viewer!.business!._id
  const { business, stages } = await t.run(async (ctx) => ({
    business: (await ctx.db.get('businesses', businessId))!,
    stages: await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) => q.eq('businessId', businessId))
      .collect(),
  }))
  const stage = (group: Doc<'stages'>['group']) =>
    stages.find((item) => item.group === group)!._id
  return { owner, businessId, noClientId: business.noClientId!, stages, stage }
}

export type TestBusiness = Awaited<ReturnType<typeof setupBusiness>>

/**
 * The stage counts and the Worker assignment rows equal a recount of the jobs
 * (D105, D106). Empty groups, stages and members count as absent.
 */
export async function jobIndexProblems(t: TestConvex) {
  return await t.run(async (ctx) => {
    const problems: string[] = []
    const jobs = await ctx.db.query('jobs').collect()
    const businessIds = new Set<string>(jobs.map((job) => job.businessId))
    for (const row of await ctx.db.query('jobCounts').collect()) {
      businessIds.add(row.businessId)
    }
    const groupsOf = () => ({ new: 0, in_progress: 0, done: 0, cancelled: 0 })
    const ordered = (groups: Record<string, number> = groupsOf()) =>
      JSON.stringify(Object.entries({ ...groupsOf(), ...groups }).sort())
    for (const businessId of businessIds) {
      const mine = jobs.filter((job) => job.businessId === businessId)
      const groups = groupsOf()
      const stages: Record<string, number> = {}
      const members: Record<string, ReturnType<typeof groupsOf>> = {}
      const assignments = new Set<string>()
      for (const job of mine) {
        groups[job.stageGroup]++
        stages[job.stageId] = (stages[job.stageId] ?? 0) + 1
        for (const memberId of new Set(job.assigneeIds)) {
          members[memberId] ??= groupsOf()
          members[memberId][job.stageGroup]++
          assignments.add(
            [
              job._id,
              memberId,
              job.clientId,
              job.stageGroup,
              job.dueDate,
              job.owes,
            ].join('|'),
          )
        }
      }
      const rows = (await ctx.db.query('jobCounts').collect()).filter(
        (row) => row.businessId === businessId,
      )
      const business = rows.filter((row) => row.membershipId === undefined)
      if (business.length > 1) problems.push(`${businessId}: two count rows`)
      if (ordered(business[0]?.groups) !== ordered(groups)) {
        problems.push(
          `${businessId} groups: ${JSON.stringify(business[0]?.groups)} ≠ ${JSON.stringify(groups)}`,
        )
      }
      if (
        JSON.stringify(Object.entries(business[0]?.stages ?? {}).sort()) !==
        JSON.stringify(Object.entries(stages).sort())
      ) {
        problems.push(`${businessId} stages differ`)
      }
      const counted = rows.filter((row) => row.membershipId !== undefined)
      for (const memberId of new Set([
        ...Object.keys(members),
        ...counted.map((row) => row.membershipId as string),
      ])) {
        const own = counted.filter((row) => row.membershipId === memberId)
        if (own.length > 1) problems.push(`${memberId}: two count rows`)
        if (ordered(own[0]?.groups) !== ordered(members[memberId])) {
          problems.push(`member ${memberId} groups differ`)
        }
      }
      const stored = (await ctx.db.query('jobAssignments').collect())
        .filter((row) => row.businessId === businessId)
        .map((row) =>
          [
            row.jobId,
            row.membershipId,
            row.clientId,
            row.stageGroup,
            row.dueDate,
            row.owes,
          ].join('|'),
        )
      if (
        JSON.stringify([...stored].sort()) !==
        JSON.stringify([...assignments].sort())
      ) {
        problems.push(`${businessId}: assignments differ`)
      }
    }
    return problems
  })
}

/** Gives a job its assignees, as the ledger does. */
export async function assignJob(
  t: TestConvex,
  jobId: Id<'jobs'>,
  membershipIds: Array<Id<'memberships'>>,
) {
  await t.run((ctx) => patchJob(ctx, jobId, { assigneeIds: membershipIds }))
}

/** Every cache equals a recomputation from scratch (ADR 0008). */
export async function expectCachesFresh(t: TestConvex) {
  expect(await jobIndexProblems(t)).toEqual([])
  const stale = await t.run(async (ctx) => {
    const problems: string[] = []
    for (const job of await ctx.db.query('jobs').collect()) {
      const fresh = await computeJobCache(ctx, job)
      for (const [key, value] of Object.entries(fresh)) {
        if (job[key as keyof typeof fresh] !== value) {
          problems.push(
            `job ${job.title}.${key}: ${job[key as keyof typeof fresh]} ≠ ${value}`,
          )
        }
      }
      if (
        job.priceCents !==
        job.paidCents + job.balanceCents + (job.writeOff?.amountCents ?? 0)
      ) {
        problems.push(`job ${job.title}: price ≠ paid + balance + write-off`)
      }
    }
    for (const payment of await ctx.db.query('payments').collect()) {
      const fresh = await computePaymentCache(ctx, payment._id)
      if (payment.allocatedCents !== fresh.allocatedCents) {
        problems.push(`payment ${payment._id}.allocatedCents`)
      }
    }
    for (const client of await ctx.db.query('clients').collect()) {
      const fresh = await computeClientCache(ctx, client._id)
      if (client.creditCents !== fresh.creditCents) {
        problems.push(
          `client ${client.name}.creditCents: ${client.creditCents} ≠ ${fresh.creditCents}`,
        )
      }
    }
    return problems
  })
  expect(stale).toEqual([])
}

export async function lastActivity(t: TestConvex) {
  return await t.run(
    async (ctx) => (await ctx.db.query('activity').order('desc').first())!,
  )
}

export async function getDoc<T extends TableNames>(
  t: TestConvex,
  table: T,
  id: Id<T>,
) {
  return (await t.run((ctx) => ctx.db.get(table, id))) as Doc<T>
}

/**
 * Stores a blob of `bytes` zero bytes. convex-test drops the content type, so
 * it is written into the `_storage` metadata by hand, as the real backend does.
 */
export function storeBlob(t: TestConvex, bytes: number, contentType: string) {
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([new Uint8Array(bytes)]))
    const db = ctx.db as unknown as {
      patch: (table: string, id: string, value: object) => Promise<void>
    }
    await db.patch('_storage', id, { contentType })
    return id
  })
}

/** A second member of the owner's business, as a worker or a manager. */
export async function addMember(
  t: TestConvex,
  b: TestBusiness,
  role: 'manager' | 'worker',
) {
  const identity = {
    ...STRANGER,
    subject: `user_${role}`,
    tokenIdentifier: `https://clerk.test|user_${role}`,
  }
  const member = t.withIdentity(identity)
  await member.mutation(api.users.ensureCurrent, {})
  const membershipId = await t.run(async (ctx) => {
    const user = (await ctx.db
      .query('users')
      .withIndex('by_token', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier),
      )
      .unique())!
    return await ctx.db.insert('memberships', {
      businessId: b.businessId,
      userId: user._id,
      role,
      notify: { morningSummary: false, remindersDue: false, overdue: false },
    })
  })
  return { member, membershipId }
}
