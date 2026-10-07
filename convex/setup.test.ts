// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { getDoc, lastActivity, setupBusiness, setupConvex } from './test.setup'
import type { TestConvex } from './test.setup'
import type { Id } from './_generated/dataModel'
import { REPEAT_CHOICES } from '../shared/repeat'
import { ITEM_KINDS, JOB_WORDS, REMINDER_MONTHS } from '../shared/setup'

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

  it('every repeat interval setup offers is stored', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    for (const { key, every, unit } of REPEAT_CHOICES) {
      await owner.mutation(api.setup.apply, {
        businessId,
        answers: { repeat: 'schedule', repeatEvery: key },
      })
      expect((await getDoc(t, 'businesses', businessId)).repeatDefault).toEqual(
        { every, unit },
      )
    }
  })

  it('every reminder delay setup offers is stored', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    for (const months of REMINDER_MONTHS) {
      await owner.mutation(api.setup.apply, {
        businessId,
        answers: { repeat: 'months', reminderMonths: months },
      })
      const business = await getDoc(t, 'businesses', businessId)
      expect(business.reminderRule).toEqual({ months })
      expect(business.repeatDefault).toBeUndefined()
    }
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

  it('setup.current starts from the stored answers', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    expect(
      (await owner.query(api.setup.current, { businessId })).answers,
    ).toBeNull()
    await owner.mutation(api.setup.apply, {
      businessId,
      answers: { businessName: 'Ателие' },
    })
    const result = await owner.query(api.setup.current, { businessId })
    expect(result.answers?.businessName).toBe('Ателие')
    expect(result.current.setupDone).toBe(true)
  })
})
