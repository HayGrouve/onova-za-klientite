// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import { DEFAULT_MODULES } from '../shared/setup'
import { addMember, assignJob, setupBusiness, setupConvex } from './test.setup'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T08:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

async function shop() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const { owner, businessId } = b
  const clientId = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Иван Петров',
  })
  await owner.mutation(api.businesses.setModules, {
    businessId,
    modules: { ...DEFAULT_MODULES, reminders: true },
  })
  return {
    t,
    ...b,
    clientId,
    job: (title: string, dueDate?: string) =>
      owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title,
        dueDate,
      }),
    month: (month: string) =>
      owner.query(api.calendar.month, { businessId, month }),
  }
}

describe('calendar.month', () => {
  it('lists the month’s visits, open jobs due and open reminders', async () => {
    const s = await shop()
    const { owner, businessId } = s
    const wardrobe = await s.job('Гардероб', '2026-11-20')
    const kitchen = await s.job('Кухня')
    await owner.mutation(api.appointments.add, {
      businessId,
      jobId: kitchen,
      date: '2026-11-03',
      time: { hour: 9, minute: 30 },
      label: 'Оглед',
    })
    // Another month, and a cancelled visit, stay out.
    await owner.mutation(api.appointments.add, {
      businessId,
      jobId: kitchen,
      date: '2026-12-01',
    })
    const cancelled = await owner.mutation(api.appointments.add, {
      businessId,
      jobId: wardrobe,
      date: '2026-11-04',
    })
    await owner.mutation(api.appointments.cancel, {
      businessId,
      appointmentId: cancelled,
    })
    await owner.mutation(api.reminders.add, {
      businessId,
      clientId: s.clientId,
      date: '2026-11-15',
      note: 'Обади се за профилактика',
    })

    const november = await s.month('2026-11')
    expect(
      november.visits.map((visit) => [visit.job?.title, visit.days]),
    ).toEqual([['Кухня', ['2026-11-03']]])
    expect(november.visits[0].label).toBe('Оглед')
    expect(november.due.map((job) => job.title)).toEqual(['Гардероб'])
    expect(november.reminders.map((reminder) => reminder.note)).toEqual([
      'Обади се за профилактика',
    ])
    expect(november.reminders[0].clientName).toBe('Иван Петров')

    const october = await s.month('2026-10')
    expect(october).toEqual({ visits: [], due: [], reminders: [] })
  })

  it('a stretch over the turn of the month is on its days in both', async () => {
    const s = await shop()
    const jobId = await s.job('Монтаж')
    await s.owner.mutation(api.appointments.add, {
      businessId: s.businessId,
      jobId,
      date: '2026-10-30',
      endDate: '2026-11-02',
    })
    expect((await s.month('2026-10')).visits[0].days).toEqual([
      '2026-10-30',
      '2026-10-31',
    ])
    expect((await s.month('2026-11')).visits[0].days).toEqual([
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('a done job’s due date is not on it, nor a module that is off', async () => {
    const s = await shop()
    const done = await s.job('Готова', '2026-11-10')
    await s.owner.mutation(api.jobs.changeStage, {
      businessId: s.businessId,
      jobId: done,
      stageId: s.stage('done'),
    })
    const visited = await s.job('С посещение')
    await s.owner.mutation(api.appointments.add, {
      businessId: s.businessId,
      jobId: visited,
      date: '2026-11-12',
    })
    await s.owner.mutation(api.reminders.add, {
      businessId: s.businessId,
      clientId: s.clientId,
      date: '2026-11-15',
      note: 'Обади се',
    })
    await s.owner.mutation(api.businesses.setModules, {
      businessId: s.businessId,
      modules: { ...DEFAULT_MODULES, appointments: false, reminders: false },
    })
    expect(await s.month('2026-11')).toEqual({
      visits: [],
      due: [],
      reminders: [],
    })
  })

  it('a Worker sees only their own jobs, and no reminders', async () => {
    const s = await shop()
    const { member, membershipId } = await addMember(s.t, s, 'worker')
    const theirs = await s.job('Своя', '2026-11-05')
    await s.job('Чужда', '2026-11-06')
    await assignJob(s.t, theirs, [membershipId])
    await s.owner.mutation(api.reminders.add, {
      businessId: s.businessId,
      clientId: s.clientId,
      date: '2026-11-15',
      note: 'Обади се',
    })
    const seen = await member.query(api.calendar.month, {
      businessId: s.businessId,
      month: '2026-11',
    })
    expect(seen.due.map((job) => job.title)).toEqual(['Своя'])
    expect(seen.reminders).toEqual([])
  })

  it('refuses a month that isn’t one', async () => {
    const s = await shop()
    await expect(s.month('2026-13')).rejects.toThrow(/invalid/)
  })
})
