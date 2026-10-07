// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  STRANGER,
  expectCachesFresh,
  setupBusiness,
  setupConvex,
} from './test.setup'
import type { TestBusiness, TestConvex } from './test.setup'

// Every module's exports, to find every public function.
const modules = import.meta.glob<Record<string, unknown>>(
  [
    './*.ts',
    '!./*.*.ts',
    '!./schema.ts',
    '!./convex.config.ts',
    '!./auth.config.ts',
    '!./validators.ts',
    '!./seedData.ts',
  ],
  { eager: true },
)

function publicFunctions() {
  const names: Array<{ name: string; kind: 'query' | 'mutation' }> = []
  for (const [path, exports] of Object.entries(modules)) {
    const module = path.replace(/^\.\//, '').replace(/\.ts$/, '')
    for (const [exportName, value] of Object.entries(exports)) {
      const fn = value as {
        isPublic?: boolean
        isQuery?: boolean
        isMutation?: boolean
      }
      if (!fn.isPublic) continue
      if (fn.isQuery || fn.isMutation) {
        names.push({
          name: `${module}:${exportName}`,
          kind: fn.isQuery ? 'query' : 'mutation',
        })
      }
    }
  }
  return names.sort((a, b) => a.name.localeCompare(b.name))
}

/** The owner's records, for a stranger to aim at. */
async function ownerData(t: TestConvex, b: TestBusiness) {
  const { owner, businessId } = b
  const clientId = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Иван',
  })
  const jobId = await owner.mutation(api.jobs.create, {
    businessId,
    clientId,
    title: 'Гардероб',
    typedPriceCents: 10000,
  })
  const itemId = await owner.mutation(api.items.create, {
    businessId,
    clientId,
    name: 'Шкаф',
  })
  const paymentId = await owner.mutation(api.payments.addFromClient, {
    businessId,
    clientId,
    amountCents: 20000,
    date: '2026-10-06',
    method: 'cash',
    allocations: [],
  })
  const costId = await owner.mutation(api.costs.add, {
    businessId,
    jobId,
    amountCents: 1000,
    date: '2026-10-06',
    label: 'Материали',
  })
  const fieldId = await owner.mutation(api.fields.add, {
    businessId,
    target: 'client',
    name: 'Цвят',
    type: 'choice',
    options: ['Бял'],
  })
  const optionId = (await t.run((ctx) => ctx.db.get('fields', fieldId)))!
    .options![0].id
  return { clientId, jobId, itemId, paymentId, costId, fieldId, optionId }
}

type AnyArgs = Record<string, unknown>

type Ids = Awaited<ReturnType<typeof ownerData>> & TestBusiness

/** Valid arguments for each business-scoped function, aimed at the owner's data. */
const FIXTURES: Record<string, (ids: Ids) => Record<string, unknown>> = {
  'clients:create': () => ({ name: 'Нов' }),
  'clients:update': (ids) => ({ clientId: ids.clientId, name: 'Друг' }),
  'costs:add': (ids) => ({
    jobId: ids.jobId,
    amountCents: 100,
    date: '2026-10-06',
    label: 'x',
  }),
  'costs:remove': (ids) => ({ costId: ids.costId }),
  'costs:update': (ids) => ({ costId: ids.costId, amountCents: 200 }),
  'fields:add': () => ({ target: 'job', name: 'Поле', type: 'text' }),
  'fields:addOption': (ids) => ({ fieldId: ids.fieldId, name: 'Черен' }),
  'fields:archive': (ids) => ({ fieldId: ids.fieldId }),
  'fields:restore': (ids) => ({ fieldId: ids.fieldId }),
  'fields:update': (ids) => ({ fieldId: ids.fieldId, name: 'Тон' }),
  'fields:updateOption': (ids) => ({
    fieldId: ids.fieldId,
    optionId: ids.optionId,
    name: 'Сив',
  }),
  'items:create': (ids) => ({ clientId: ids.clientId, name: 'Стол' }),
  'items:move': (ids) => ({ itemId: ids.itemId, toClientId: ids.clientId }),
  'items:update': (ids) => ({ itemId: ids.itemId, name: 'Маса' }),
  'jobs:cancel': (ids) => ({ jobId: ids.jobId }),
  'jobs:changeStage': (ids) => ({
    jobId: ids.jobId,
    stageId: ids.stage('done'),
  }),
  'jobs:create': (ids) => ({ clientId: ids.clientId, title: 'Нова' }),
  'jobs:removeWriteOff': (ids) => ({ jobId: ids.jobId }),
  'jobs:setItems': (ids) => ({ jobId: ids.jobId, itemIds: [ids.itemId] }),
  'jobs:setLines': (ids) => ({ jobId: ids.jobId, lines: [] }),
  'jobs:update': (ids) => ({ jobId: ids.jobId, title: 'Друга' }),
  'jobs:writeOff': (ids) => ({ jobId: ids.jobId, note: 'x' }),
  'newJob:context': () => ({}),
  'newJob:save': (ids) => ({
    client: { kind: 'existing', clientId: ids.clientId },
    title: 'Нова',
  }),
  'payments:addFromClient': (ids) => ({
    clientId: ids.clientId,
    amountCents: 100,
    date: '2026-10-06',
    method: 'cash',
  }),
  'payments:addFromJob': (ids) => ({
    jobId: ids.jobId,
    amountCents: 100,
    date: '2026-10-06',
    method: 'cash',
  }),
  'payments:refund': (ids) => ({
    clientId: ids.clientId,
    amountCents: 100,
    date: '2026-10-06',
    method: 'cash',
  }),
  'payments:remove': (ids) => ({ paymentId: ids.paymentId }),
  'payments:useCredit': (ids) => ({ jobId: ids.jobId }),
  'setup:apply': () => ({ answers: { businessName: 'Чужд' } }),
  'setup:current': () => ({}),
  'stages:add': () => ({ name: 'Етап', group: 'new' }),
  'stages:remove': (ids) => ({ stageId: ids.stage('cancelled') }),
  'stages:reorder': (ids) => ({
    stageIds: ids.stages.map((stage) => stage._id),
  }),
  'stages:update': (ids) => ({ stageId: ids.stage('new'), name: 'Оглед' }),
}

/** Functions outside any business: they act only on the caller's own user. */
const USER_SCOPED = [
  'users:ensureCurrent',
  'users:setActiveBusiness',
  'users:viewer',
]

/** Functions that take no record id, so only the business check applies. */
const NO_RECORD_IDS = new Set([
  'clients:create',
  'fields:add',
  'newJob:context',
  'setup:apply',
  'setup:current',
  'stages:add',
])

describe('business is the auth scope (ADR 0006)', () => {
  it('every public function is either user-scoped or has a stranger fixture', () => {
    const names = publicFunctions().map((fn) => fn.name)
    const covered = new Set([...Object.keys(FIXTURES), ...USER_SCOPED])
    expect(names.filter((name) => !covered.has(name))).toEqual([])
  })

  it.each(publicFunctions().filter((fn) => fn.name in FIXTURES))(
    'a stranger calling $name fails, with any business id',
    async ({ name, kind }) => {
      const t = setupConvex()
      const b = await setupBusiness(t)
      const ids = { ...b, ...(await ownerData(t, b)) }
      const stranger = await setupBusiness(t, STRANGER)
      const args = FIXTURES[name](ids)
      const call = (businessId: Id<'businesses'>) =>
        kind === 'query'
          ? stranger.owner.query(
              makeFunctionReference<'query', AnyArgs>(name),
              {
                businessId,
                ...args,
              },
            )
          : stranger.owner.mutation(
              makeFunctionReference<'mutation', AnyArgs>(name),
              {
                businessId,
                ...args,
              },
            )

      // The owner's business id: not a member.
      await expect(call(b.businessId)).rejects.toThrow(/auth.notMember/)
      // The stranger's own business id with the owner's records: not found.
      if (!NO_RECORD_IDS.has(name)) {
        await expect(call(stranger.businessId)).rejects.toThrow(/notFound/)
      }
    },
  )
})

/** The activity event each mutation logs, or null where the fixture is a no-op. */
const EVENTS: Record<string, string | null> = {
  'clients:create': 'client.created',
  'clients:update': 'client.edited',
  'costs:add': 'cost.added',
  'costs:remove': 'cost.removed',
  'costs:update': 'cost.edited',
  'fields:add': 'field.added',
  'fields:addOption': 'field.edited',
  'fields:archive': 'field.archived',
  'fields:restore': null,
  'fields:update': 'field.edited',
  'fields:updateOption': 'field.edited',
  'items:create': 'item.created',
  'items:move': null,
  'items:update': 'item.edited',
  'jobs:cancel': 'job.cancelled',
  'jobs:changeStage': 'job.stageChanged',
  'jobs:create': 'job.created',
  'jobs:removeWriteOff': null,
  'jobs:setItems': 'job.itemsChanged',
  'jobs:setLines': 'job.linesChanged',
  'jobs:update': 'job.edited',
  'jobs:writeOff': 'job.writtenOff',
  'newJob:save': 'job.created',
  'payments:addFromClient': 'payment.added',
  'payments:addFromJob': 'payment.added',
  'payments:refund': 'payment.added',
  'payments:remove': 'payment.removed',
  'payments:useCredit': 'credit.used',
  'setup:apply': 'setup.applied',
  'stages:add': 'stage.added',
  'stages:remove': 'stage.removed',
  'stages:reorder': 'stages.reordered',
  'stages:update': 'stage.edited',
}

describe('activity log', () => {
  it('every mutation fixture has an expected event', () => {
    const mutations = publicFunctions()
      .filter((fn) => fn.kind === 'mutation' && fn.name in FIXTURES)
      .map((fn) => fn.name)
    expect(Object.keys(EVENTS).sort()).toEqual(mutations.sort())
  })

  it.each(Object.keys(EVENTS))(
    '%s logs its event and keeps caches fresh',
    async (name) => {
      const t = setupConvex()
      const b = await setupBusiness(t)
      const ids = { ...b, ...(await ownerData(t, b)) }
      const before = await t.run(
        async (ctx) => (await ctx.db.query('activity').collect()).length,
      )
      await b.owner.mutation(makeFunctionReference<'mutation', AnyArgs>(name), {
        businessId: b.businessId,
        ...FIXTURES[name](ids),
      })
      const events = await t.run((ctx) => ctx.db.query('activity').collect())
      const expected = EVENTS[name]
      if (expected === null) {
        expect(events).toHaveLength(before)
      } else {
        expect(events).toHaveLength(before + 1)
        expect(events.at(-1)?.type).toBe(expected)
        expect(events.at(-1)?.actorId).toBeDefined()
      }
      await expectCachesFresh(t)
    },
  )
})
