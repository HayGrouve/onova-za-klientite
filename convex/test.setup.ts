/// <reference types="vite/client" />
// Convex skips files with more than one dot, so this never deploys.
import { convexTest } from 'convex-test'
import { expect } from 'vitest'
import schema from './schema'
import { api } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
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
  return convexTest(schema, modules)
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

/** Every cache equals a recomputation from scratch (ADR 0008). */
export async function expectCachesFresh(t: TestConvex) {
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
