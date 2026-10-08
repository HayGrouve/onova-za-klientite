// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { getDoc, lastActivity, setupBusiness, setupConvex } from './test.setup'

describe('extra fields', () => {
  it('fields that hold data are archived, not deleted; restoring brings the data back', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const fieldId = await owner.mutation(api.fields.add, {
      businessId,
      target: 'client',
      name: 'Препоръчан от',
      type: 'text',
    })
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван',
      extra: { [fieldId]: 'Мария' },
    })
    await owner.mutation(api.fields.archive, { businessId, fieldId })
    expect((await lastActivity(t)).type).toBe('field.archived')
    // Editing the client without the archived field keeps its value.
    await owner.mutation(api.clients.update, {
      businessId,
      clientId,
      extra: {},
    })
    expect((await getDoc(t, 'clients', clientId)).extra[fieldId]).toBe('Мария')
    // An archived field takes no new values.
    await expect(
      owner.mutation(api.clients.update, {
        businessId,
        clientId,
        extra: { [fieldId]: 'Петър' },
      }),
    ).rejects.toThrow(/field.value/)

    await owner.mutation(api.fields.restore, { businessId, fieldId })
    expect((await getDoc(t, 'fields', fieldId)).archivedAt).toBeUndefined()
    expect((await getDoc(t, 'clients', clientId)).extra[fieldId]).toBe('Мария')
  })

  it("a field's type can change only between text and long text", async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const fieldId = await owner.mutation(api.fields.add, {
      businessId,
      target: 'job',
      name: 'Бележка',
      type: 'text',
    })
    await owner.mutation(api.fields.update, {
      businessId,
      fieldId,
      type: 'longText',
    })
    expect((await getDoc(t, 'fields', fieldId)).type).toBe('longText')
    await expect(
      owner.mutation(api.fields.update, {
        businessId,
        fieldId,
        type: 'number',
      }),
    ).rejects.toThrow(/field.typeChange/)
  })

  it('choice options are stored by id, so renaming an option updates every record', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const fieldId = await owner.mutation(api.fields.add, {
      businessId,
      target: 'item',
      name: 'Характер',
      type: 'choice',
      options: ['Спокоен', 'Хапе'],
    })
    const optionId = (await getDoc(t, 'fields', fieldId)).options![0].id
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани',
    })
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Рекс',
      extra: { [fieldId]: optionId },
    })
    expect((await getDoc(t, 'items', itemId)).searchText).toContain('spokoen')

    await owner.mutation(api.fields.updateOption, {
      businessId,
      fieldId,
      optionId,
      name: 'Кротък',
    })
    await t.finishAllScheduledFunctions(() => {})
    const item = await getDoc(t, 'items', itemId)
    expect(item.extra[fieldId]).toBe(optionId)
    expect(item.searchText).toContain('krotak')
    expect(item.searchText).not.toContain('spokoen')
  })

  it('values must fit the field type', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const fieldId = await owner.mutation(api.fields.add, {
      businessId,
      target: 'item',
      name: 'Пробег',
      type: 'number',
    })
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани',
    })
    await expect(
      owner.mutation(api.items.create, {
        businessId,
        clientId,
        name: 'Golf',
        extra: { [fieldId]: 'много' },
      }),
    ).rejects.toThrow(/field.value/)
  })
})

describe('field edge cases', () => {
  it('long text saved before a change to text stays saveable', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const fieldId = await owner.mutation(api.fields.add, {
      businessId,
      target: 'client',
      name: 'Бележка',
      type: 'longText',
    })
    const long = 'дълъг текст '.repeat(60)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Ани',
      extra: { [fieldId]: long },
    })
    await owner.mutation(api.fields.update, {
      businessId,
      fieldId,
      type: 'text',
    })
    await owner.mutation(api.clients.update, {
      businessId,
      clientId,
      name: 'Ани Г.',
      extra: { [fieldId]: long },
    })
  })
})

describe('show in list', () => {
  it('list rows carry the values of the fields shown in lists, and only those', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const field = (
      target: 'client' | 'job',
      name: string,
      showInList: boolean,
    ) =>
      owner.mutation(api.fields.add, {
        businessId,
        target,
        name,
        type: 'text',
        showInList,
      })
    const breed = await field('client', 'Порода', true)
    const note = await field('client', 'Бележка', false)
    const plate = await field('job', 'Номер', true)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
      extra: { [breed]: 'Пудел', [note]: 'вътрешно' },
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Подстригване',
      typedPriceCents: 4000,
    })
    await owner.mutation(api.jobs.update, {
      businessId,
      jobId,
      extra: { [plate]: 'СА 1234 ВР' },
    })

    const clients = await owner.query(api.clients.list, { businessId })
    const maria = clients.find((client) => client._id === clientId)
    expect(maria?.listExtra).toEqual({ [breed]: 'Пудел' })

    const { jobs } = await owner.query(api.jobs.list, {
      businessId,
      group: 'new',
    })
    expect(jobs.find((job) => job._id === jobId)?.listExtra).toEqual({
      [plate]: 'СА 1234 ВР',
    })

    // Switched off, or archived: nothing comes with the rows.
    await owner.mutation(api.fields.update, {
      businessId,
      fieldId: plate,
      showInList: false,
    })
    await owner.mutation(api.fields.archive, { businessId, fieldId: breed })
    const after = await owner.query(api.jobs.list, { businessId, group: 'new' })
    expect(
      after.jobs.find((job) => job._id === jobId)?.listExtra,
    ).toBeUndefined()
    const clientsAfter = await owner.query(api.clients.list, { businessId })
    expect(
      clientsAfter.find((client) => client._id === clientId)?.listExtra,
    ).toBeUndefined()
  })

  it("an item's fields shown in lists come with it on the job page and in search", async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const settings = await owner.query(api.businesses.settings, { businessId })
    await owner.mutation(api.businesses.setModules, {
      businessId,
      modules: { ...settings.modules, items: true },
    })
    const size = await owner.mutation(api.fields.add, {
      businessId,
      target: 'item',
      name: 'Размер',
      type: 'text',
      showInList: true,
    })
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Георги',
    })
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Бъди',
      extra: { [size]: 'Средно' },
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Къпане',
      itemIds: [itemId],
    })
    const job = await owner.query(api.jobs.get, { businessId, jobId })
    expect(job.items[0].listExtra).toEqual({ [size]: 'Средно' })
    const found = await owner.query(api.search.all, {
      businessId,
      query: 'Бъди',
    })
    expect(found.items[0].listExtra).toEqual({ [size]: 'Средно' })
  })
})
