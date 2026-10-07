// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { getDoc, lastActivity, setupBusiness, setupConvex } from './test.setup'
import type { TestConvex } from './test.setup'
import type { Id } from './_generated/dataModel'
import { ITEM_KINDS, JOB_WORDS, answersFromBusiness } from '../shared/setup'

async function stagesOf(t: TestConvex, businessId: Id<'businesses'>) {
  return await t.run((ctx) =>
    ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) => q.eq('businessId', businessId))
      .collect(),
  )
}

describe('setup.apply', () => {
  it('skipping every step still finishes setup with a working business', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.setup.apply, { businessId, answers: {} })
    const business = await getDoc(t, 'businesses', businessId)
    expect(business.setup.completedAt).toBeDefined()
    expect(business.words.job.singular).toBe('Поръчка')
    expect((await stagesOf(t, businessId)).map((stage) => stage.name)).toEqual([
      'Насрочено',
      'В работа',
      'Готово',
      'Отказано',
    ])
    expect((await lastActivity(t)).type).toBe('setup.applied')
  })

  it('a first run sets words, stages, item fields, services and modules', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: {
        businessName: 'Хладина Сервиз',
        jobWord: JOB_WORDS.find((word) => word.singular === 'Посещение'),
        flow: 'single',
        hasItem: true,
        item: ITEM_KINDS.find((kind) => kind.word.singular === 'Климатик'),
        costs: false,
        repeat: 'months',
        reminderMonths: 12,
        services: [{ name: 'Профилактика', price: '50' }],
      },
    })
    const business = await getDoc(t, 'businesses', businessId)
    expect(business.name).toBe('Хладина Сервиз')
    expect(business.words.job.plural).toBe('Посещения')
    expect(business.words.item.singular).toBe('Климатик')
    expect(business.modules).toMatchObject({
      items: true,
      costs: false,
      reminders: true,
      services: true,
    })
    expect(business.reminderRule).toEqual({ months: 12 })
    const { fields, services } = await t.run(async (ctx) => ({
      fields: await ctx.db.query('fields').collect(),
      services: await ctx.db.query('services').collect(),
    }))
    expect(fields.map((field) => field.name)).toEqual(['Модел', 'Помещение'])
    expect(
      services.map((service) => [service.name, service.priceCents]),
    ).toEqual([['Профилактика', 5000]])
  })

  it('a first run on an empty business swaps in the stages of the chosen flow', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: { flow: 'multi' },
    })
    expect((await stagesOf(t, businessId)).map((stage) => stage.name)).toEqual([
      'Запитване',
      'Оглед',
      'В работа',
      'Готово',
      'Отказано',
    ])
  })

  it('running setup again never deletes a stage that holds jobs or a field that holds data', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: { hasItem: true, item: ITEM_KINDS[0] },
    })
    const firstNew = (await stagesOf(t, businessId))[0]
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван',
    })
    const plateField = (
      await t.run((ctx) => ctx.db.query('fields').collect())
    )[0]
    await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Golf',
      extra: { [plateField._id]: 'CA1234BP' },
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Ремонт',
    })

    // Run again: other flow, no item.
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: { flow: 'multi', hasItem: false },
    })
    const names = (await stagesOf(t, businessId)).map((item) => item.name)
    expect(names).toContain('Насрочено')
    expect(names).toContain('Запитване')
    expect((await getDoc(t, 'jobs', jobId)).stageId).toBe(firstNew._id)
    expect(names).toContain(firstNew.name)
    const fields = await t.run((ctx) => ctx.db.query('fields').collect())
    expect(fields).toHaveLength(3)
    expect(fields.every((field) => field.archivedAt === undefined)).toBe(true)
    const business = await getDoc(t, 'businesses', businessId)
    // The Items module is hidden, never deleted.
    expect(business.modules.items).toBe(false)
    expect(await t.run((ctx) => ctx.db.query('items').collect())).toHaveLength(
      1,
    )
  })

  it('services are merged by name', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: { services: [{ name: 'Монтаж', price: '40' }] },
    })
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: {
        services: [
          { name: 'монтаж', price: '45' },
          { name: 'Оглед', price: '20' },
        ],
      },
    })
    const services = await t.run((ctx) => ctx.db.query('services').collect())
    expect(
      services.map((service) => [service.name, service.priceCents]),
    ).toEqual([
      ['Монтаж', 4500],
      ['Оглед', 2000],
    ])
  })

  it('setup.current reports the business as it is now, Settings edits included', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    expect(
      (await owner.query(api.setup.current, { businessId })).current.setupDone,
    ).toBe(false)
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: { businessName: 'Ателие' },
    })
    await owner.mutation(api.businesses.updateProfile, {
      businessId,
      name: 'Ателие Мария',
    })
    const { current } = await owner.query(api.setup.current, { businessId })
    expect(current.name).toBe('Ателие Мария')
    expect(current.setupDone).toBe(true)
  })

  it('running setup again after Settings edits starts from the business and confirming changes nothing', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: {
        businessName: 'Кучешки Салон Ели',
        flow: 'single',
        hasItem: true,
        item: {
          word: { singular: 'Куче', plural: 'Кучета', gender: 'n' },
          fields: ['Порода'],
        },
        repeat: 'schedule',
        repeatEvery: '2weeks',
        services: [{ name: 'Къпане', price: '35' }],
      },
    })
    // Settings: a new name, an item word, a service, deposits and a reminder rule.
    await owner.mutation(api.businesses.updateProfile, {
      businessId,
      name: 'Груминг у дома - Ели',
    })
    const { words } = await getDoc(t, 'businesses', businessId)
    await owner.mutation(api.businesses.setWords, {
      businessId,
      words: {
        ...words,
        item: { singular: 'Любимец', plural: 'Любимци', gender: 'm' },
      },
    })
    await owner.mutation(api.services.add, {
      businessId,
      name: 'Подстригване',
      priceCents: 4550,
    })
    await owner.mutation(api.businesses.setNewJobOptions, {
      businessId,
      depositsOnNewJob: true,
    })
    await owner.mutation(api.businesses.setReminderRule, {
      businessId,
      months: 6,
    })

    const snapshot = async () =>
      await t.run(async (ctx) => {
        const { setup: _setup, ...business } = (await ctx.db.get(
          'businesses',
          businessId,
        ))!
        return {
          business,
          stages: await ctx.db.query('stages').collect(),
          fields: await ctx.db.query('fields').collect(),
          services: await ctx.db.query('services').collect(),
        }
      })
    const before = await snapshot()

    const { current } = await owner.query(api.setup.current, { businessId })
    const answers = answersFromBusiness(current)
    expect(answers.businessName).toBe('Груминг у дома - Ели')
    expect(answers.item?.word.singular).toBe('Любимец')
    expect(answers.services).toEqual([
      { name: 'Къпане', price: '35' },
      { name: 'Подстригване', price: '45,50' },
    ])
    await owner.mutation(api.setup.apply, { businessId, answers })

    expect(await snapshot()).toEqual(before)
  })
})
