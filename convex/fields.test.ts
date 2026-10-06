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
