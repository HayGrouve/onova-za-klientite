import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arrangeToday, lateJobCount } from './today'
import type { TodayAppointment, TodayJob } from './today'
import type { StageGroup } from './stages'

const job = (
  id: string,
  stageGroup: StageGroup = 'in_progress',
): TodayJob & { stageGroup: StageGroup } => ({ _id: id, stageGroup })

const visit = (
  id: string,
  jobId: string | undefined,
  stageGroup: StageGroup = 'in_progress',
): TodayAppointment & { id: string } => ({
  id,
  job: jobId ? job(jobId, stageGroup) : undefined,
})

const empty = {
  appointments: [],
  upcoming: [],
  overdue: [],
  dueSoon: [],
  doneUnpaid: [],
}

const ids = (rows: Array<{ _id: string }>) => rows.map((row) => row._id)
const visitIds = (rows: Array<{ id: string }>) => rows.map((row) => row.id)

describe('arrangeToday', () => {
  it('leaves jobs that appear in only one place alone, in order', () => {
    const result = arrangeToday({
      appointments: [visit('a1', 'j1'), visit('a2', 'j2')],
      upcoming: [visit('a3', 'j3')],
      overdue: [job('j4'), job('j5')],
      dueSoon: [job('j6')],
      doneUnpaid: [job('j7', 'done')],
    })
    expect(visitIds(result.appointments)).toEqual(['a1', 'a2'])
    expect(visitIds(result.upcoming)).toEqual(['a3'])
    expect(ids(result.overdue)).toEqual(['j4', 'j5'])
    expect(ids(result.dueSoon)).toEqual(['j6'])
    expect(ids(result.doneUnpaid)).toEqual(['j7'])
  })

  it('an overdue job with a visit today stays with today’s visits', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [visit('a1', 'late')],
      overdue: [job('late'), job('other')],
    })
    expect(visitIds(result.appointments)).toEqual(['a1'])
    expect(ids(result.overdue)).toEqual(['other'])
  })

  it('a due-soon job with a visit today stays with today’s visits', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [visit('a1', 'soon')],
      dueSoon: [job('soon')],
    })
    expect(visitIds(result.appointments)).toEqual(['a1'])
    expect(result.dueSoon).toEqual([])
  })

  it('a job both overdue and due soon stays overdue', () => {
    const result = arrangeToday({
      ...empty,
      overdue: [job('x')],
      dueSoon: [job('x')],
    })
    expect(ids(result.overdue)).toEqual(['x'])
    expect(result.dueSoon).toEqual([])
  })

  it('a job with a visit this week stays under what it is overdue or due for', () => {
    const result = arrangeToday({
      ...empty,
      upcoming: [visit('a1', 'late'), visit('a2', 'soon'), visit('a3', 'free')],
      overdue: [job('late')],
      dueSoon: [job('soon')],
    })
    expect(ids(result.overdue)).toEqual(['late'])
    expect(ids(result.dueSoon)).toEqual(['soon'])
    expect(visitIds(result.upcoming)).toEqual(['a3'])
  })

  it('a job with a visit today is not repeated in the week ahead', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [visit('today', 'j1')],
      upcoming: [visit('friday', 'j1'), visit('monday', 'j2')],
    })
    expect(visitIds(result.appointments)).toEqual(['today'])
    expect(visitIds(result.upcoming)).toEqual(['monday'])
  })

  it('keeps every visit today, but only the first visit of a job this week', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [visit('am', 'j1'), visit('pm', 'j1')],
      upcoming: [visit('tue', 'j2'), visit('thu', 'j2')],
    })
    expect(visitIds(result.appointments)).toEqual(['am', 'pm'])
    expect(visitIds(result.upcoming)).toEqual(['tue'])
  })

  it('leaves a Done or Cancelled job’s visits out of Today', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [
        visit('a1', 'finished', 'done'),
        visit('a2', 'dropped', 'cancelled'),
        visit('a3', 'open'),
      ],
      upcoming: [
        visit('a4', 'finished', 'done'),
        visit('a5', 'dropped', 'cancelled'),
      ],
    })
    expect(visitIds(result.appointments)).toEqual(['a3'])
    expect(result.upcoming).toEqual([])
  })

  it('a done-unpaid job shows once, even with a visit left on its calendar', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [visit('a1', 'unpaid', 'done')],
      upcoming: [visit('a2', 'unpaid', 'done')],
      doneUnpaid: [job('unpaid', 'done')],
    })
    expect(result.appointments).toEqual([])
    expect(result.upcoming).toEqual([])
    expect(ids(result.doneUnpaid)).toEqual(['unpaid'])
  })

  it('keeps visits that have no job (blocked time)', () => {
    const result = arrangeToday({
      ...empty,
      appointments: [visit('b1', undefined), visit('b2', undefined)],
      upcoming: [visit('b3', undefined)],
    })
    expect(visitIds(result.appointments)).toEqual(['b1', 'b2'])
    expect(visitIds(result.upcoming)).toEqual(['b3'])
  })

  it('never shows a job twice, whatever the lists hold', () => {
    const jobId = fc.constantFrom('a', 'b', 'c', 'd', 'e')
    const group = fc.constantFrom<StageGroup>(
      'new',
      'in_progress',
      'done',
      'cancelled',
    )
    const visits = fc.array(fc.record({ jobId, group }), { maxLength: 6 })
    const jobs = fc.array(jobId, { maxLength: 5 })
    fc.assert(
      fc.property(visits, visits, jobs, jobs, jobs, (a, b, o, s, d) => {
        const toVisits = (list: typeof a) =>
          list.map((item, index) =>
            visit(String(index), item.jobId, item.group),
          )
        const result = arrangeToday({
          appointments: toVisits(a),
          upcoming: toVisits(b),
          overdue: o.map((id) => job(id)),
          dueSoon: s.map((id) => job(id)),
          doneUnpaid: d.map((id) => job(id, 'done')),
        })
        const today = new Set(result.appointments.map((row) => row.job!._id))
        const elsewhere = [
          ...result.overdue.map((row) => row._id),
          ...result.dueSoon.map((row) => row._id),
          ...result.doneUnpaid.map((row) => row._id),
          ...result.upcoming.map((row) => row.job!._id),
        ]
        expect(new Set(elsewhere).size).toBe(elsewhere.length)
        for (const id of elsewhere) expect(today.has(id)).toBe(false)
        for (const row of [...result.appointments, ...result.upcoming]) {
          expect(['done', 'cancelled']).not.toContain(row.job!.stageGroup)
        }
      }),
    )
  })

  it('does not change the lists it was given', () => {
    const lists = {
      appointments: [visit('a1', 'j1')],
      upcoming: [visit('a2', 'j1')],
      overdue: [job('j1')],
      dueSoon: [job('j1')],
      doneUnpaid: [],
    }
    const copy = structuredClone(lists)
    arrangeToday(lists)
    expect(lists).toEqual(copy)
  })
})

describe('lateJobCount', () => {
  const TODAY = '2026-10-08'
  const dated = (
    id: string,
    dueDate: string | undefined,
    stageGroup: StageGroup = 'in_progress',
  ) => ({ _id: id, stageGroup, dueDate })
  const visitOf = (id: string, booked: ReturnType<typeof dated>) => ({
    id,
    job: booked,
  })
  const none = { appointments: [], upcoming: [], overdue: [] }

  it('is zero when nothing is late', () => {
    expect(lateJobCount(none, TODAY)).toBe(0)
    expect(
      lateJobCount(
        {
          ...none,
          overdue: [],
          appointments: [visitOf('a', dated('j1', TODAY))],
        },
        TODAY,
      ),
    ).toBe(0)
  })

  it('counts a late job listed under a visit, which the overdue list leaves out', () => {
    const arranged = arrangeToday({
      appointments: [visitOf('a1', dated('late', '2026-10-02'))],
      upcoming: [],
      overdue: [dated('late', '2026-10-02'), dated('other', '2026-10-03')],
      dueSoon: [],
      doneUnpaid: [],
    })
    expect(arranged.overdue.map((row) => row._id)).toEqual(['other'])
    expect(lateJobCount(arranged, TODAY)).toBe(2)
  })

  it('counts a job with several visits once', () => {
    const late = dated('late', '2026-10-02')
    expect(
      lateJobCount(
        {
          ...none,
          appointments: [visitOf('a1', late), visitOf('a2', late)],
          upcoming: [visitOf('a3', late)],
          overdue: [late],
        },
        TODAY,
      ),
    ).toBe(1)
  })

  it('does not count a job that is due today, undated, Done or Cancelled', () => {
    expect(
      lateJobCount(
        {
          ...none,
          appointments: [
            visitOf('a1', dated('today', TODAY)),
            visitOf('a2', dated('undated', undefined)),
            visitOf('a3', dated('done', '2026-10-01', 'done')),
            visitOf('a4', dated('cancelled', '2026-10-01', 'cancelled')),
            {},
          ],
        },
        TODAY,
      ),
    ).toBe(0)
  })
})
