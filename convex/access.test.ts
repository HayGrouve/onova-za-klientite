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
  storeBlob,
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
  const pendingStorageId = await storeBlob(t, 10, 'image/png')
  const savedStorageId = await storeBlob(t, 10, 'image/png')
  const saved = await owner.mutation(api.files.save, {
    businessId,
    storageId: savedStorageId,
    target: { kind: 'job', jobId },
  })
  if (!('fileId' in saved)) throw new Error('fixture file rejected')
  const appointmentId = await owner.mutation(api.appointments.add, {
    businessId,
    jobId,
    date: '2026-10-08',
  })
  const serviceId = await owner.mutation(api.services.add, {
    businessId,
    name: 'Монтаж',
    priceCents: 4000,
  })
  return {
    serviceId,
    appointmentId,
    clientId,
    jobId,
    itemId,
    paymentId,
    costId,
    fieldId,
    optionId,
    pendingStorageId,
    fileId: saved.fileId,
  }
}

type AnyArgs = Record<string, unknown>

type Ids = Awaited<ReturnType<typeof ownerData>> & TestBusiness

/** Valid arguments for each business-scoped function, aimed at the owner's data. */
const FIXTURES: Record<string, (ids: Ids) => Record<string, unknown>> = {
  'appointments:add': (ids) => ({ jobId: ids.jobId, date: '2026-10-09' }),
  'appointments:cancel': (ids) => ({ appointmentId: ids.appointmentId }),
  'appointments:update': (ids) => ({
    appointmentId: ids.appointmentId,
    date: '2026-10-10',
  }),
  'businesses:setModules': () => ({
    modules: {
      appointments: true,
      costs: true,
      items: true,
      reminders: false,
      services: true,
    },
  }),
  'businesses:setNewJobOptions': () => ({ depositsOnNewJob: true }),
  'businesses:setReminderRule': () => ({ months: 6 }),
  'businesses:setWords': () => ({
    words: {
      client: { singular: 'Клиент', plural: 'Клиенти', gender: 'm' },
      job: { singular: 'Ремонт', plural: 'Ремонти', gender: 'm' },
      item: { singular: 'Обект', plural: 'Обекти', gender: 'm' },
      appointment: { singular: 'Среща', plural: 'Срещи', gender: 'f' },
    },
  }),
  'businesses:settings': () => ({}),
  'businesses:updateProfile': () => ({ name: 'Чужд' }),
  'clients:create': () => ({ name: 'Нов' }),
  'clients:get': (ids) => ({ clientId: ids.clientId }),
  'clients:list': () => ({}),
  'clients:update': (ids) => ({ clientId: ids.clientId, name: 'Друг' }),
  'costs:add': (ids) => ({
    jobId: ids.jobId,
    amountCents: 100,
    date: '2026-10-06',
    label: 'x',
  }),
  'costs:remove': (ids) => ({ costId: ids.costId }),
  'costs:update': (ids) => ({ costId: ids.costId, amountCents: 200 }),
  'files:generateUploadUrl': () => ({}),
  'files:list': (ids) => ({ target: { kind: 'job', jobId: ids.jobId } }),
  'files:remove': (ids) => ({ fileId: ids.fileId }),
  'files:save': (ids) => ({
    storageId: ids.pendingStorageId,
    target: { kind: 'job', jobId: ids.jobId },
  }),
  'fields:list': () => ({ target: 'client' }),
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
  'items:byClient': (ids) => ({ clientId: ids.clientId }),
  'items:get': (ids) => ({ itemId: ids.itemId }),
  'items:create': (ids) => ({ clientId: ids.clientId, name: 'Стол' }),
  'items:move': (ids) => ({ itemId: ids.itemId, toClientId: ids.clientId }),
  'items:update': (ids) => ({ itemId: ids.itemId, name: 'Маса' }),
  'jobs:get': (ids) => ({ jobId: ids.jobId }),
  'jobs:list': () => ({ group: 'new' }),
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
  'money:summary': () => ({ month: '2026-10' }),
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
  'services:add': () => ({ name: 'Нова', priceCents: 100 }),
  'services:list': () => ({}),
  'services:reorder': (ids) => ({ serviceIds: [ids.serviceId] }),
  'services:update': (ids) => ({ serviceId: ids.serviceId, priceCents: 200 }),
  'setup:apply': () => ({ answers: { businessName: 'Чужд' } }),
  'setup:current': () => ({}),
  'stages:add': () => ({ name: 'Етап', group: 'new' }),
  'stages:remove': (ids) => ({ stageId: ids.stage('cancelled') }),
  'stages:reorder': (ids) => ({
    stageIds: ids.stages.map((stage) => stage._id),
  }),
  'today:list': () => ({ today: '2026-10-07' }),
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
  'businesses:setModules',
  'businesses:setNewJobOptions',
  'businesses:setReminderRule',
  'businesses:setWords',
  'businesses:settings',
  'businesses:updateProfile',
  'services:add',
  'clients:list',
  'fields:list',
  'jobs:list',
  'services:list',
  'today:list',
  'clients:create',
  'fields:add',
  'files:generateUploadUrl',
  'files:list',
  'money:summary',
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
  'appointments:add': 'appointment.added',
  'appointments:cancel': 'appointment.cancelled',
  'appointments:update': 'appointment.changed',
  'businesses:setModules': 'settings.changed',
  'businesses:setNewJobOptions': 'settings.changed',
  'businesses:setReminderRule': 'settings.changed',
  'businesses:setWords': 'settings.changed',
  'businesses:updateProfile': 'settings.changed',
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
  'files:generateUploadUrl': null,
  'files:remove': 'file.removed',
  'files:save': 'file.added',
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
  'services:add': 'settings.changed',
  'services:reorder': 'settings.changed',
  'services:update': 'settings.changed',
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
