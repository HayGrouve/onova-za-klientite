// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  STRANGER,
  getDoc,
  lastActivity,
  setupBusiness,
  setupConvex,
} from './test.setup'
import type { TestConvex } from './test.setup'

/** Today lists reminders only while the Reminders module is on. */
async function turnOnReminders(t: TestConvex, businessId: Id<'businesses'>) {
  await t.run(async (ctx) => {
    const business = (await ctx.db.get('businesses', businessId))!
    await ctx.db.patch('businesses', businessId, {
      modules: { ...business.modules, reminders: true },
    })
  })
}

describe('reminders', () => {
  it('add, done and dismiss; open ones list soonest first', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const later = await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2027-10-01',
      note: 'Годишна профилактика',
      source: 'rule',
    })
    const sooner = await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2026-11-01',
      note: 'Обади се',
    })
    expect((await lastActivity(t)).type).toBe('reminder.added')
    expect(
      (
        await owner.query(api.reminders.forClient, { businessId, clientId })
      ).map((r) => r._id),
    ).toEqual([sooner, later])
    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId: sooner,
      status: 'done',
    })
    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId: later,
      status: 'dismissed',
    })
    expect((await getDoc(t, 'reminders', later)).status).toBe('dismissed')
    expect(
      await owner.query(api.reminders.forClient, { businessId, clientId }),
    ).toEqual([])
  })

  it('a reminder on a job belongs to the job’s client', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const otherId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Друг',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Фреон',
    })
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      jobId,
      date: '2026-12-01',
      note: 'x',
    })
    expect((await getDoc(t, 'reminders', reminderId)).clientId).toBe(clientId)
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        jobId,
        clientId: otherId,
        date: '2026-12-01',
        note: 'x',
      }),
    ).rejects.toThrow(/job.otherClient/)
  })

  it('snoozing moves the date: the reminder leaves Today and waits for the new day', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await turnOnReminders(t, businessId)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2026-10-07',
      note: 'Подстригване на Рекс',
    })
    const onToday = (today: string) =>
      owner
        .query(api.today.list, { businessId, today })
        .then((data) => data.reminders.map((reminder) => reminder._id))
    expect(await onToday('2026-10-08')).toEqual([reminderId])

    await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: '2026-10-15',
    })
    const moved = await getDoc(t, 'reminders', reminderId)
    expect(moved.date).toBe('2026-10-15')
    expect(moved.status).toBe('open')
    expect(await onToday('2026-10-08')).toEqual([])
    expect(await onToday('2026-10-15')).toEqual([reminderId])
    expect(
      (await owner.query(api.reminders.forClient, { businessId, clientId }))[0]
        .date,
    ).toBe('2026-10-15')
    const event = await lastActivity(t)
    expect(event.type).toBe('reminder.moved')
    expect(event.data).toMatchObject({
      from: '2026-10-07',
      to: '2026-10-15',
      note: 'Подстригване на Рекс',
    })
  })

  it('snoozing back to the old date undoes it', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      clientId: noClientId,
      date: '2026-10-07',
      note: 'x',
    })
    await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: '2026-11-07',
    })
    await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: '2026-10-07',
    })
    expect((await getDoc(t, 'reminders', reminderId)).date).toBe('2026-10-07')
  })

  it('snoozing to the same day, or a closed reminder, changes nothing and logs nothing', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      clientId: noClientId,
      date: '2026-10-07',
      note: 'x',
    })
    const events = () =>
      t.run(async (ctx) => (await ctx.db.query('activity').collect()).length)
    const before = await events()
    await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: '2026-10-07',
    })
    expect(await events()).toBe(before)

    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId,
      status: 'done',
    })
    const closed = await events()
    await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: '2026-12-01',
    })
    const after = await getDoc(t, 'reminders', reminderId)
    expect(after.date).toBe('2026-10-07')
    expect(after.status).toBe('done')
    expect(await events()).toBe(closed)
  })

  it('snoozing needs a real date', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      clientId: noClientId,
      date: '2026-10-07',
      note: 'x',
    })
    for (const date of ['', '2026-02-30', 'утре', '2026-13-01']) {
      await expect(
        owner.mutation(api.reminders.snooze, { businessId, reminderId, date }),
      ).rejects.toThrow(/invalid/)
    }
    expect((await getDoc(t, 'reminders', reminderId)).date).toBe('2026-10-07')
  })

  it('reopening brings a done or dismissed reminder back, as it was', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await turnOnReminders(t, businessId)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Мария',
    })
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2026-10-07',
      note: 'Обади се',
    })
    for (const status of ['done', 'dismissed'] as const) {
      await owner.mutation(api.reminders.close, {
        businessId,
        reminderId,
        status,
      })
      expect(
        await owner.query(api.reminders.forClient, { businessId, clientId }),
      ).toEqual([])

      await owner.mutation(api.reminders.reopen, { businessId, reminderId })
      const back = await getDoc(t, 'reminders', reminderId)
      expect(back.status).toBe('open')
      expect(back.closedAt).toBeUndefined()
      expect(back.date).toBe('2026-10-07')
      expect(
        (
          await owner.query(api.reminders.forClient, { businessId, clientId })
        ).map((reminder) => reminder._id),
      ).toEqual([reminderId])
      expect((await lastActivity(t)).type).toBe('reminder.reopened')
    }
    const today = await owner.query(api.today.list, {
      businessId,
      today: '2026-10-07',
    })
    expect(today.reminders.map((reminder) => reminder._id)).toEqual([
      reminderId,
    ])
  })

  it('reopening a reminder that is already open does nothing', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const reminderId = await owner.mutation(api.reminders.add, {
      businessId,
      clientId: noClientId,
      date: '2026-10-07',
      note: 'x',
    })
    await owner.mutation(api.reminders.reopen, { businessId, reminderId })
    expect((await lastActivity(t)).type).toBe('reminder.added')
  })

  it('another business can neither snooze nor reopen a reminder', async () => {
    const t = setupConvex()
    const mine = await setupBusiness(t)
    const theirs = await setupBusiness(t, STRANGER)
    const reminderId = await mine.owner.mutation(api.reminders.add, {
      businessId: mine.businessId,
      clientId: mine.noClientId,
      date: '2026-10-07',
      note: 'x',
    })
    await mine.owner.mutation(api.reminders.close, {
      businessId: mine.businessId,
      reminderId,
      status: 'done',
    })
    await expect(
      theirs.owner.mutation(api.reminders.snooze, {
        businessId: theirs.businessId,
        reminderId,
        date: '2026-12-01',
      }),
    ).rejects.toThrow(/notFound/)
    await expect(
      theirs.owner.mutation(api.reminders.reopen, {
        businessId: theirs.businessId,
        reminderId,
      }),
    ).rejects.toThrow(/notFound/)
    const kept = await getDoc(t, 'reminders', reminderId)
    expect(kept.status).toBe('done')
    expect(kept.date).toBe('2026-10-07')
  })
})
