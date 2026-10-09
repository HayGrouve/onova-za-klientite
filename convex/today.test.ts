// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { lateJobCount } from '../shared/today'
import { setupBusiness, setupConvex } from './test.setup'

// 8 Oct 2026 is a Thursday, so "this week" runs to the following Thursday.
const TODAY = '2026-10-08'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T06:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

async function shop() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Иван Петров',
  })
  const { owner, businessId } = b
  return {
    t,
    ...b,
    job: (title: string, dueDate?: string, priceCents?: number) =>
      owner.mutation(api.jobs.create, {
        businessId,
        clientId,
        title,
        dueDate,
        typedPriceCents: priceCents,
      }),
    visit: (
      jobId: Id<'jobs'>,
      date: string,
      time?: { hour: number; minute: number },
      label?: string,
    ) =>
      owner.mutation(api.appointments.add, {
        businessId,
        jobId,
        date,
        time,
        label,
      }),
    today: async () => {
      const data = await owner.query(api.today.list, {
        businessId,
        today: TODAY,
      })
      const titles = (rows: Array<{ title: string }>) =>
        rows.map((row) => row.title)
      const visits = (rows: typeof data.appointments) =>
        rows.map((row) => row.job?.title)
      return {
        data,
        appointments: visits(data.appointments),
        upcoming: visits(data.upcoming),
        overdue: titles(data.overdue),
        dueSoon: titles(data.dueSoon),
        doneUnpaid: titles(data.doneUnpaid),
      }
    },
  }
}

describe('today.list shows each job once', () => {
  it('a late job with a visit today is under the visits, not Overdue', async () => {
    const { job, visit, today } = await shop()
    const late = await job('Късен', '2026-10-04')
    await job('Друг късен', '2026-10-05')
    await visit(late, TODAY, { hour: 14, minute: 0 }, 'Монтаж')
    const result = await today()
    expect(result.appointments).toEqual(['Късен'])
    expect(result.overdue).toEqual(['Друг късен'])
    // The row that stays still says it is late, and what the visit is.
    const row = result.data.appointments[0]
    expect(row.job?.dueDate).toBe('2026-10-04')
    expect(row.label).toBe('Монтаж')
    expect(row.allDay).toBe(false)
  })

  it('a due-soon job with a visit this week is under Due soon, not the week ahead', async () => {
    const { job, visit, today } = await shop()
    const soon = await job('Скоро', '2026-10-10')
    await visit(soon, '2026-10-12', { hour: 10, minute: 0 })
    const free = await job('Свободен')
    await visit(free, '2026-10-13')
    const result = await today()
    expect(result.dueSoon).toEqual(['Скоро'])
    expect(result.upcoming).toEqual(['Свободен'])
  })

  it('a late job with a visit this week stays under Overdue', async () => {
    const { job, visit, today } = await shop()
    const late = await job('Късен', '2026-10-01')
    await visit(late, '2026-10-12', { hour: 10, minute: 0 })
    const result = await today()
    expect(result.overdue).toEqual(['Късен'])
    expect(result.upcoming).toEqual([])
  })

  it('a job with a visit today and another on Friday is listed once', async () => {
    const { job, visit, today } = await shop()
    const both = await job('Двудневен')
    await visit(both, TODAY, { hour: 9, minute: 0 })
    await visit(both, '2026-10-09', { hour: 9, minute: 0 })
    const result = await today()
    expect(result.appointments).toEqual(['Двудневен'])
    expect(result.upcoming).toEqual([])
  })
})

describe('today.list leaves finished and cancelled jobs out of the schedule', () => {
  it('a Done job keeps its leftover visits off Today, and its calendar', async () => {
    const { t, owner, businessId, stage, job, visit, today } = await shop()
    const finished = await job('Готов', undefined, 10000)
    const visitId = await visit(finished, '2026-10-13', { hour: 10, minute: 0 })
    await visit(finished, TODAY, { hour: 16, minute: 0 })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: finished,
      stageId: stage('done'),
    })
    const result = await today()
    expect(result.appointments).toEqual([])
    expect(result.upcoming).toEqual([])
    // It is done but unpaid, so it still appears once, where money is chased.
    expect(result.doneUnpaid).toEqual(['Готов'])
    // Nothing was deleted or cancelled.
    const stored = await t.run((ctx) => ctx.db.query('appointments').collect())
    expect(stored).toHaveLength(2)
    expect(stored.every((item) => item.cancelledAt === undefined)).toBe(true)
    expect(stored.some((item) => item._id === visitId)).toBe(true)
  })

  it('a Done and paid job is nowhere on Today', async () => {
    const { owner, businessId, stage, job, visit, today } = await shop()
    const paid = await job('Платен')
    await visit(paid, '2026-10-12', { hour: 10, minute: 0 })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: paid,
      stageId: stage('done'),
    })
    const result = await today()
    expect(result.upcoming).toEqual([])
    expect(result.doneUnpaid).toEqual([])
  })

  it('a Cancelled job’s visits are not on Today', async () => {
    const { owner, businessId, stage, job, visit, today } = await shop()
    const dropped = await job('Отказан')
    await visit(dropped, TODAY, { hour: 11, minute: 0 })
    await visit(dropped, '2026-10-12')
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: dropped,
      stageId: stage('cancelled'),
    })
    const result = await today()
    expect(result.appointments).toEqual([])
    expect(result.upcoming).toEqual([])
  })
})

describe('today.list takes the time from the device', () => {
  it('shows a visit under its job until 12 hours after it, by the `now` it is given', async () => {
    const { owner, businessId, job, visit } = await shop()
    const id = await job('Монтаж')
    // 08:00 Sofia on the 8th (UTC+3), all day off.
    await visit(id, TODAY, { hour: 8, minute: 0 })
    const rowAt = async (now: number) => {
      const data = await owner.query(api.today.list, {
        businessId,
        today: TODAY,
        now,
      })
      return data.appointments[0].job?.nextAppointment
    }
    const start = Date.parse('2026-10-08T05:00:00Z')
    expect(await rowAt(start + 11 * 3_600_000)).toBeDefined()
    expect(await rowAt(start + 13 * 3_600_000)).toBeUndefined()
  })
})

describe('the morning summary counts what Today lists', () => {
  it('has the same appointment, overdue and reminder counts on a busy day', async () => {
    const { t, owner, businessId, stage, job, visit, today } = await shop()
    await t.run(async (ctx) => {
      const business = (await ctx.db.get('businesses', businessId))!
      await ctx.db.patch('businesses', businessId, {
        modules: { ...business.modules, reminders: true },
      })
    })
    // Visit today on an overdue job: shown under the visit, once.
    const lateWithVisit = await job('Късен с посещение', '2026-10-02')
    await visit(lateWithVisit, TODAY, { hour: 9, minute: 0 })
    // Overdue without a visit.
    await job('Късен', '2026-10-03')
    await job('Друг късен', '2026-10-04')
    // A Done job with a visit today: not on Today, so not in the summary.
    const finished = await job('Готов', undefined, 10000)
    await visit(finished, TODAY, { hour: 10, minute: 0 })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: finished,
      stageId: stage('done'),
    })
    // A Cancelled job with a visit today, and a cancelled visit.
    const dropped = await job('Отказан', '2026-10-01')
    await visit(dropped, TODAY, { hour: 11, minute: 0 })
    await owner.mutation(api.jobs.changeStage, {
      businessId,
      jobId: dropped,
      stageId: stage('cancelled'),
    })
    const cancelledVisit = await visit(await job('Пореден'), TODAY, {
      hour: 12,
      minute: 0,
    })
    await owner.mutation(api.appointments.cancel, {
      businessId,
      appointmentId: cancelledVisit,
    })
    // A visit with no job at all, and two open reminders.
    await t.run(async (ctx) => {
      await ctx.db.insert('appointments', {
        businessId,
        start: new Date('2026-10-08T13:00:00Z').getTime(),
        allDay: false,
        assigneeIds: [],
      })
      for (const date of ['2026-10-08', '2026-10-01']) {
        await ctx.db.insert('reminders', {
          businessId,
          date,
          note: 'Обадете се',
          source: 'manual',
          status: 'open',
        })
      }
    })

    const shown = (await today()).data
    const counts = await t.run(async (ctx) => {
      const { summaryCounts } = await import('./lib/summary')
      const business = (await ctx.db.get('businesses', businessId))!
      const member = (await ctx.db.query('memberships').first())!
      return await summaryCounts(ctx, business, member, TODAY, {
        overdue: true,
        reminders: true,
      })
    })
    expect(counts).toEqual({
      appointments: shown.appointments.length,
      overdue: lateJobCount(shown, TODAY),
      reminders: shown.reminders.length,
    })
    // And the numbers are the ones Today's own rules give: the late job under
    // today's visit is late too, though the overdue list leaves it out.
    expect(shown.overdue).toHaveLength(2)
    expect(counts).toEqual({ appointments: 2, overdue: 3, reminders: 2 })
  })
})
