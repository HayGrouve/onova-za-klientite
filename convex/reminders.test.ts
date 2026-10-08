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

/** Today and the pages list reminders only while the Reminders module is on. */
async function turnOnReminders(t: TestConvex, businessId: Id<'businesses'>) {
  await t.run(async (ctx) => {
    const business = (await ctx.db.get('businesses', businessId))!
    await ctx.db.patch('businesses', businessId, {
      modules: { ...business.modules, reminders: true },
    })
  })
}

/** The open reminders a record's page lists. */
const remindersOn = async <T>(page: Promise<{ reminders: T }>) =>
  (await page).reminders

describe('reminders', () => {
  it('add, done and dismiss; open ones list soonest first', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await turnOnReminders(t, businessId)
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
        await remindersOn(
          owner.query(api.clients.get, { businessId, clientId }),
        )
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
      await remindersOn(owner.query(api.clients.get, { businessId, clientId })),
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

  it('the rule never reminds about a job of the built-in No client', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const walkIn = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Бърз ремонт',
    })
    const named = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Фреон',
    })
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        jobId: walkIn,
        date: '2027-10-01',
        note: 'Бърз ремонт',
        source: 'rule',
      }),
    ).rejects.toThrow(/client.noClient/)
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        clientId: noClientId,
        date: '2027-10-01',
        note: 'x',
        source: 'rule',
      }),
    ).rejects.toThrow(/client.noClient/)
    // A rule reminder with nobody to follow up is refused too.
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        date: '2027-10-01',
        note: 'x',
        source: 'rule',
      }),
    ).rejects.toThrow(/client.noClient/)
    await owner.mutation(api.reminders.add, {
      businessId,
      jobId: named,
      date: '2027-10-01',
      note: 'Фреон',
      source: 'rule',
    })
  })

  it("an item's reminder stays with the item's client and job", async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const elena = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const petar = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Петър',
    })
    const unit = await owner.mutation(api.items.create, {
      businessId,
      clientId: elena,
      name: 'Daikin, хол',
    })
    const otherJob = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: elena,
      title: 'Друго',
    })
    // Another client's item, or a job the item isn't on, is refused.
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        clientId: petar,
        itemId: unit,
        date: '2027-01-10',
        note: 'Профилактика',
      }),
    ).rejects.toThrow(/item.otherClient/)
    await expect(
      owner.mutation(api.reminders.add, {
        businessId,
        jobId: otherJob,
        itemId: unit,
        date: '2027-01-10',
        note: 'Профилактика',
      }),
    ).rejects.toThrow(/item.otherJob/)
  })

  it('a page lists no reminders while the Reminders module is off', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2027-10-01',
      note: 'Годишна профилактика',
      source: 'manual',
    })
    expect(
      await remindersOn(owner.query(api.clients.get, { businessId, clientId })),
    ).toEqual([])
    await turnOnReminders(t, businessId)
    expect(
      await remindersOn(owner.query(api.clients.get, { businessId, clientId })),
    ).toHaveLength(1)
  })

  it('a job lists its own open reminders, soonest first', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await turnOnReminders(t, businessId)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Профилактика',
    })
    const otherJobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Фреон',
    })
    const later = await owner.mutation(api.reminders.add, {
      businessId,
      jobId,
      date: '2027-10-01',
      note: 'Годишна профилактика',
      source: 'rule',
    })
    const sooner = await owner.mutation(api.reminders.add, {
      businessId,
      jobId,
      date: '2026-11-01',
      note: 'Обади се',
    })
    const closed = await owner.mutation(api.reminders.add, {
      businessId,
      jobId,
      date: '2026-10-20',
      note: 'Свършено',
    })
    // Not the job's: another job's, and one on the client alone.
    await owner.mutation(api.reminders.add, {
      businessId,
      jobId: otherJobId,
      date: '2026-10-15',
      note: 'Друга',
    })
    await owner.mutation(api.reminders.add, {
      businessId,
      clientId,
      date: '2026-10-16',
      note: 'Само клиент',
    })
    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId: closed,
      status: 'done',
    })
    const listed = await remindersOn(
      owner.query(api.jobs.get, { businessId, jobId }),
    )
    expect(listed.map((r) => r._id)).toEqual([sooner, later])
    expect(listed[1]).toMatchObject({
      note: 'Годишна профилактика',
      date: '2027-10-01',
      source: 'rule',
    })
  })

  it('an item lists the open reminders that point at it', async () => {
    const t = setupConvex()
    const { owner, businessId } = await setupBusiness(t)
    await turnOnReminders(t, businessId)
    const clientId = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Елена',
    })
    const itemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Daikin, хол',
    })
    const otherItemId = await owner.mutation(api.items.create, {
      businessId,
      clientId,
      name: 'Daikin, спалня',
    })
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId,
      title: 'Профилактика',
      itemIds: [itemId],
    })
    // The rule's reminder points at the job and its first item.
    const fromRule = await owner.mutation(api.reminders.add, {
      businessId,
      jobId,
      itemId,
      date: '2027-10-01',
      note: 'Профилактика',
      source: 'rule',
    })
    const direct = await owner.mutation(api.reminders.add, {
      businessId,
      itemId,
      date: '2026-11-01',
      note: 'Смени филтъра',
    })
    await owner.mutation(api.reminders.add, {
      businessId,
      itemId: otherItemId,
      date: '2026-10-15',
      note: 'Друг обект',
    })
    const dismissed = await owner.mutation(api.reminders.add, {
      businessId,
      itemId,
      date: '2026-10-20',
      note: 'Махнато',
    })
    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId: dismissed,
      status: 'dismissed',
    })
    expect(
      (
        await remindersOn(owner.query(api.items.get, { businessId, itemId }))
      ).map((r) => r._id),
    ).toEqual([direct, fromRule])
    // A reminder added on an item belongs to the item's client too.
    expect(
      (
        await remindersOn(
          owner.query(api.clients.get, { businessId, clientId }),
        )
      ).map((r) => r._id),
    ).toContain(direct)
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

    // It answers with the day the reminder was on, so an undo can put it back.
    expect(
      await owner.mutation(api.reminders.snooze, {
        businessId,
        reminderId,
        date: '2026-10-15',
      }),
    ).toBe('2026-10-07')
    const moved = await getDoc(t, 'reminders', reminderId)
    expect(moved.date).toBe('2026-10-15')
    expect(moved.status).toBe('open')
    expect(await onToday('2026-10-08')).toEqual([])
    expect(await onToday('2026-10-15')).toEqual([reminderId])
    expect(
      (
        await remindersOn(
          owner.query(api.clients.get, { businessId, clientId }),
        )
      )[0].date,
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
    const before = await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: '2026-11-07',
    })
    await owner.mutation(api.reminders.snooze, {
      businessId,
      reminderId,
      date: before!,
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
    expect(
      await owner.mutation(api.reminders.snooze, {
        businessId,
        reminderId,
        date: '2026-10-07',
      }),
    ).toBeNull()
    expect(await events()).toBe(before)

    await owner.mutation(api.reminders.close, {
      businessId,
      reminderId,
      status: 'done',
    })
    const closed = await events()
    expect(
      await owner.mutation(api.reminders.snooze, {
        businessId,
        reminderId,
        date: '2026-12-01',
      }),
    ).toBeNull()
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
        await remindersOn(
          owner.query(api.clients.get, { businessId, clientId }),
        ),
      ).toEqual([])

      await owner.mutation(api.reminders.reopen, { businessId, reminderId })
      const back = await getDoc(t, 'reminders', reminderId)
      expect(back.status).toBe('open')
      expect(back.closedAt).toBeUndefined()
      expect(back.date).toBe('2026-10-07')
      expect(
        (
          await remindersOn(
            owner.query(api.clients.get, { businessId, clientId }),
          )
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
