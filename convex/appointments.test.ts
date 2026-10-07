// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { lastActivity, setupBusiness, setupConvex } from './test.setup'

describe('appointments log their time for the history', () => {
  it('adding and changing keep the date and the time, when there is one', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Иван Петров',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Гардероб',
    })
    const appointmentId = await owner.mutation(api.appointments.add, {
      businessId,
      jobId,
      date: '2026-10-08',
      time: { hour: 14, minute: 0 },
      label: 'Монтаж',
    })
    expect((await lastActivity(t)).data.to).toBe('2026-10-08 14:00')

    await owner.mutation(api.appointments.update, {
      businessId,
      appointmentId,
      date: '2026-10-15',
    })
    const changed = await lastActivity(t)
    expect(changed.type).toBe('appointment.changed')
    expect(changed.data.to).toBe('2026-10-15')

    await owner.mutation(api.appointments.update, {
      businessId,
      appointmentId,
      date: '2026-10-15',
      time: { hour: 9, minute: 5 },
    })
    expect((await lastActivity(t)).data.to).toBe('2026-10-15 9:05')
  })
})
