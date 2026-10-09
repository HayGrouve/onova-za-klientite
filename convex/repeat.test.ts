// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import { dateInSofia, sofiaTimeToUtc } from '../shared/dates'
import { REPEAT_CHOICES, nextJobDate } from '../shared/repeat'
import {
  addMember,
  expectCachesFresh,
  getDoc,
  setupBusiness,
  setupConvex,
} from './test.setup'

async function weeklyJob() {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const clientId = await b.owner.mutation(api.clients.create, {
    businessId: b.businessId,
    name: 'Офис',
  })
  const { jobId } = await b.owner.mutation(api.newJob.save, {
    businessId: b.businessId,
    client: { kind: 'existing', clientId },
    title: 'Почистване',
    typedPriceCents: 6000,
    when: { date: '2026-10-07', time: { hour: 8, minute: 30 } },
  })
  await b.owner.mutation(api.jobs.setRepeat, {
    businessId: b.businessId,
    jobId,
    every: 1,
    unit: 'week',
  })
  return { t, ...b, clientId, jobId }
}

describe('repeat (Q6)', () => {
  it('when the job’s date arrives, the next job is created one interval later', async () => {
    const { t, jobId } = await weeklyJob()
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBe('2026-10-07')
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-06' })).toBe(
      0,
    )
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      1,
    )

    const first = await getDoc(t, 'jobs', jobId)
    const nextId = first.repeat!.nextJobId!
    const next = await getDoc(t, 'jobs', nextId)
    expect(next.title).toBe('Почистване')
    expect(next.priceCents).toBe(6000)
    expect(next.stageGroup).toBe('new')
    expect(next.seriesId).toBe(jobId)
    expect(next.nextRepeatOn).toBe('2026-10-14')
    const appointment = (
      await t.run((ctx) =>
        ctx.db
          .query('appointments')
          .withIndex('by_job', (q) => q.eq('jobId', nextId))
          .collect(),
      )
    )[0]
    expect(appointment.start).toBe(sofiaTimeToUtc('2026-10-14', 8, 30))
    await expectCachesFresh(t)
  })

  it('is idempotent: running twice creates one job', async () => {
    const { t } = await weeklyJob()
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(2)
  })

  it('keeps the wall-clock time across the daylight saving change', async () => {
    const { t } = await weeklyJob()
    // 21 Oct → 28 Oct crosses the 25 Oct changeover.
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    await t.mutation(internal.repeat.run, { today: '2026-10-14' })
    await t.mutation(internal.repeat.run, { today: '2026-10-21' })
    const starts = (
      await t.run((ctx) => ctx.db.query('appointments').collect())
    )
      .map((item) => item.start)
      .sort()
    expect(starts.at(-1)).toBe(sofiaTimeToUtc('2026-10-28', 8, 30))
  })

  it('stop repeating ends the series', async () => {
    const { t, owner, businessId, jobId } = await weeklyJob()
    await owner.mutation(api.jobs.stopRepeat, { businessId, jobId })
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-30' })).toBe(
      0,
    )
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBeUndefined()
  })

  it('a job without a date cannot repeat', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'x',
    })
    await expect(
      owner.mutation(api.jobs.setRepeat, {
        businessId,
        jobId,
        every: 1,
        unit: 'month',
      }),
    ).rejects.toThrow(/job.noDate/)
  })

  it('a monthly due date moves by a month', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Абонамент',
      dueDate: '2026-01-31',
    })
    await owner.mutation(api.jobs.setRepeat, {
      businessId,
      jobId,
      every: 1,
      unit: 'month',
    })
    await t.mutation(internal.repeat.run, { today: '2026-02-01' })
    const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId!
    expect((await getDoc(t, 'jobs', nextId)).dueDate).toBe('2026-02-28')
  })

  it('a monthly series from the 31st goes back to the 31st after a short month', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const firstId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Абонамент',
      dueDate: '2026-01-31',
    })
    await owner.mutation(api.jobs.setRepeat, {
      businessId,
      jobId: firstId,
      every: 1,
      unit: 'month',
    })
    const expected = [
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ]
    let current = firstId
    let due = '2026-01-31'
    const seen: string[] = []
    for (const next of expected) {
      expect(await t.mutation(internal.repeat.run, { today: due })).toBe(1)
      const job = await getDoc(t, 'jobs', current)
      current = job.repeat!.nextJobId!
      const created = await getDoc(t, 'jobs', current)
      seen.push(created.dueDate!)
      // What the Job page promises for the next one is what the run creates.
      expect(created.nextRepeatOn).toBe(next)
      due = next
    }
    expect(seen).toEqual(expected)
  })

  it('a job someone moved to another day carries on from that day', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const firstId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Абонамент',
      dueDate: '2026-01-31',
    })
    await owner.mutation(api.jobs.setRepeat, {
      businessId,
      jobId: firstId,
      every: 1,
      unit: 'month',
    })
    await t.mutation(internal.repeat.run, { today: '2026-01-31' })
    const secondId = (await getDoc(t, 'jobs', firstId)).repeat!.nextJobId!
    // The February job is moved to the 10th: the series now follows the 10th.
    await owner.mutation(api.jobs.update, {
      businessId,
      jobId: secondId,
      dueDate: '2026-02-10',
    })
    await t.mutation(internal.repeat.run, { today: '2026-02-10' })
    const thirdId = (await getDoc(t, 'jobs', secondId)).repeat!.nextJobId!
    expect((await getDoc(t, 'jobs', thirdId)).dueDate).toBe('2026-03-10')
  })

  it('stops retrying when the job’s creator and the owner are gone', async () => {
    const { t, jobId } = await weeklyJob()
    // The only member goes: nobody is left to create the next job as.
    await t.run(async (ctx) => {
      const job = (await ctx.db.get('jobs', jobId))!
      await ctx.db.delete('memberships', job.createdBy)
    })
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      0,
    )
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBeUndefined()
    // The run no longer finds it.
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-08' })).toBe(
      0,
    )
  })

  it('carries on as the owner when the creator is gone', async () => {
    const { t, owner, businessId, clientId, ...b } = await weeklyJob()
    const { member: manager, membershipId } = await addMember(
      t,
      { owner, businessId, ...b },
      'manager',
    )
    const { jobId } = await manager.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'existing', clientId },
      title: 'От управител',
      when: { date: '2026-10-07' },
    })
    await manager.mutation(api.jobs.setRepeat, {
      businessId,
      jobId,
      every: 1,
      unit: 'week',
    })
    await t.run(async (ctx) => ctx.db.delete('memberships', membershipId))
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId
    expect(nextId).toBeDefined()
    const next = await getDoc(t, 'jobs', nextId!)
    const owners = await t.run((ctx) =>
      ctx.db
        .query('memberships')
        .collect()
        .then((rows) => rows.filter((row) => row.role === 'owner')),
    )
    expect(next.createdBy).toBe(owners[0]._id)
    expect(next.nextRepeatOn).toBe('2026-10-14')
  })

  it('carries on as the owner when the creator is deactivated', async () => {
    const { t, owner, businessId, clientId, ...b } = await weeklyJob()
    const { member: manager, membershipId } = await addMember(
      t,
      { owner, businessId, ...b },
      'manager',
    )
    const { jobId } = await manager.mutation(api.newJob.save, {
      businessId,
      client: { kind: 'existing', clientId },
      title: 'От управител',
      when: { date: '2026-10-07' },
    })
    await manager.mutation(api.jobs.setRepeat, {
      businessId,
      jobId,
      every: 1,
      unit: 'week',
    })
    await t.run((ctx) =>
      ctx.db.patch('memberships', membershipId, { deactivatedAt: Date.now() }),
    )
    await t.mutation(internal.repeat.run, { today: '2026-10-07' })
    const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId
    expect(nextId).toBeDefined()
    const next = await getDoc(t, 'jobs', nextId!)
    const creator = await getDoc(t, 'memberships', next.createdBy)
    expect(creator.role).toBe('owner')
    expect(creator.deactivatedAt).toBeUndefined()
  })

  it('stops the series of an anonymized client: no job, no more retries', async () => {
    const { t, owner, businessId, clientId, jobId } = await weeklyJob()
    // Anonymize clears the date the run looks for.
    await owner.mutation(api.clientsAdmin.anonymize, { businessId, clientId })
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBeUndefined()
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      0,
    )
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(1)
  })

  it('does not create a job on a client anonymized after the date was set', async () => {
    const { t, jobId, clientId } = await weeklyJob()
    // A stale date (set again after anonymize, or a race): the run still refuses.
    await t.run((ctx) =>
      ctx.db.patch('clients', clientId, { anonymizedAt: Date.now() }),
    )
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      0,
    )
    const job = await getDoc(t, 'jobs', jobId)
    expect(job.nextRepeatOn).toBeUndefined()
    expect(job.repeat!.nextJobId).toBeUndefined()
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(1)
  })

  it('continues on the survivor when the job’s client was merged into another', async () => {
    const { t, owner, businessId, clientId, jobId } = await weeklyJob()
    const survivor = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Склад Груп',
    })
    await t.run((ctx) =>
      ctx.db.patch('clients', clientId, { mergedIntoId: survivor }),
    )
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      1,
    )
    const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId!
    const next = await getDoc(t, 'jobs', nextId)
    expect(next.clientId).toBe(survivor)
    expect(next.searchText).toContain('sklad')
    const appointments = await t.run((ctx) =>
      ctx.db
        .query('appointments')
        .withIndex('by_job', (q) => q.eq('jobId', nextId))
        .collect(),
    )
    expect(appointments.map((row) => row.clientId)).toEqual([survivor])
    await expectCachesFresh(t)
  })

  it('stops the series when the survivor of a merge was anonymized', async () => {
    const { t, owner, businessId, clientId, jobId } = await weeklyJob()
    const survivor = await owner.mutation(api.clients.create, {
      businessId,
      name: 'Склад Груп',
    })
    await t.run(async (ctx) => {
      await ctx.db.patch('clients', clientId, { mergedIntoId: survivor })
      await ctx.db.patch('clients', survivor, { anonymizedAt: Date.now() })
    })
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      0,
    )
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBeUndefined()
    expect(await t.run((ctx) => ctx.db.query('jobs').collect())).toHaveLength(1)
  })

  it.each(REPEAT_CHOICES)(
    'a due date repeats $key: the next job gets the date the screen shows',
    async ({ every, unit }) => {
      const t = setupConvex()
      const { owner, businessId, noClientId } = await setupBusiness(t)
      const jobId = await owner.mutation(api.jobs.create, {
        businessId,
        clientId: noClientId,
        title: 'Климатик',
        dueDate: '2026-10-07',
      })
      await owner.mutation(api.jobs.setRepeat, {
        businessId,
        jobId,
        every,
        unit,
      })
      const shown = nextJobDate(
        { appointments: [], dueDate: '2026-10-07' },
        { every, unit },
      )
      expect(
        await t.mutation(internal.repeat.run, { today: '2026-10-07' }),
      ).toBe(1)
      const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId!
      expect((await getDoc(t, 'jobs', nextId)).dueDate).toBe(shown)
    },
  )

  it.each(REPEAT_CHOICES)(
    'an appointment repeats $key: the next appointment is on the date the screen shows',
    async ({ every, unit }) => {
      const { t, owner, businessId, jobId } = await weeklyJob()
      await owner.mutation(api.jobs.setRepeat, {
        businessId,
        jobId,
        every,
        unit,
      })
      const appointments = await t.run((ctx) =>
        ctx.db
          .query('appointments')
          .withIndex('by_job', (q) => q.eq('jobId', jobId))
          .collect(),
      )
      const shown = nextJobDate({ appointments }, { every, unit })
      await t.mutation(internal.repeat.run, { today: '2026-10-07' })
      const nextId = (await getDoc(t, 'jobs', jobId)).repeat!.nextJobId!
      const next = await t.run((ctx) =>
        ctx.db
          .query('appointments')
          .withIndex('by_job', (q) => q.eq('jobId', nextId))
          .collect(),
      )
      expect(next).toHaveLength(1)
      expect(dateInSofia(next[0].start)).toBe(shown)
    },
  )

  it('the date is the last appointment that is not cancelled, else the due date (D41)', async () => {
    const { t, owner, businessId, jobId } = await weeklyJob()
    const later = await owner.mutation(api.appointments.add, {
      businessId,
      jobId,
      date: '2026-10-09',
      time: { hour: 10, minute: 0 },
    })
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBe('2026-10-09')
    await owner.mutation(api.appointments.cancel, {
      businessId,
      appointmentId: later,
    })
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBe('2026-10-07')
  })

  it('changing the due date moves the day the next job is made', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Абонамент',
      dueDate: '2026-10-07',
    })
    await owner.mutation(api.jobs.setRepeat, {
      businessId,
      jobId,
      every: 1,
      unit: 'month',
    })
    await owner.mutation(api.jobs.update, {
      businessId,
      jobId,
      dueDate: '2026-10-20',
    })
    expect((await getDoc(t, 'jobs', jobId)).nextRepeatOn).toBe('2026-10-20')
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-07' })).toBe(
      0,
    )
    expect(await t.mutation(internal.repeat.run, { today: '2026-10-20' })).toBe(
      1,
    )
    // Taking the due date away leaves nothing to repeat from.
    const other = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'Друг',
      dueDate: '2026-10-07',
    })
    await owner.mutation(api.jobs.setRepeat, {
      businessId,
      jobId: other,
      every: 1,
      unit: 'week',
    })
    await owner.mutation(api.jobs.update, {
      businessId,
      jobId: other,
      dueDate: null,
    })
    expect((await getDoc(t, 'jobs', other)).nextRepeatOn).toBeUndefined()
  })

  it('rejects a repeat that is not a whole number of weeks or months, up to 52', async () => {
    const t = setupConvex()
    const { owner, businessId, noClientId } = await setupBusiness(t)
    const jobId = await owner.mutation(api.jobs.create, {
      businessId,
      clientId: noClientId,
      title: 'x',
      dueDate: '2026-10-07',
    })
    for (const every of [0, 53, 1.5]) {
      await expect(
        owner.mutation(api.jobs.setRepeat, {
          businessId,
          jobId,
          every,
          unit: 'month',
        }),
      ).rejects.toThrow(/invalid/)
    }
  })
})
