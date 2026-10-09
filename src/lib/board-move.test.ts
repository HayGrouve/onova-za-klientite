import { describe, expect, it } from 'vitest'
import { moveOnBoard } from './board-move'

const job = (id: string, stageGroup: string, balanceCents = 0) => ({
  _id: id,
  _creationTime: 1,
  title: id,
  stageId: stageGroup === 'done' ? 's3' : 's1',
  stageName: 'x',
  stageGroup,
  balanceCents,
  owes: balanceCents > 0 && stageGroup === 'done',
  priceCents: balanceCents,
})
const column = (group: string, jobs: ReturnType<typeof job>[]) => ({
  group,
  jobs,
  olderOwing: [],
  total: jobs.length,
  totalCapped: false,
  owedCents: jobs.reduce(
    (sum, item) => sum + (item.owes ? item.balanceCents : 0),
    0,
  ),
})
const board = (() => ({
  stages: [
    { _id: 's1', name: 'New', group: 'new' },
    { _id: 's3', name: 'Done', group: 'done' },
    { _id: 's4', name: 'Cancelled', group: 'cancelled' },
  ],
  columns: [
    column('new', [job('a', 'new', 5000), job('b', 'new')]),
    column('in_progress', []),
    column('done', []),
    column('cancelled', []),
  ],
}))() as never as Parameters<typeof moveOnBoard>[0]

describe('moveOnBoard', () => {
  it('moves a job to the stage column and moves the counts and the owed sum', () => {
    const next = moveOnBoard(board, 'a' as never, 's3' as never, 99)!
    const [fresh, , done] = next.columns
    expect(fresh.jobs.map((item) => item._id)).toEqual(['b'])
    expect(fresh.total).toBe(1)
    expect(done.jobs.map((item) => item._id)).toEqual(['a'])
    expect(done.jobs[0]).toMatchObject({
      stageId: 's3',
      doneAt: 99,
      owes: true,
    })
    expect(done.total).toBe(1)
    expect(done.owedCents).toBe(5000)
  })

  it('a job that is cancelled stops owing', () => {
    const next = moveOnBoard(board, 'a' as never, 's4' as never, 99)!
    expect(next.columns[3].jobs[0]).toMatchObject({ owes: false })
    expect(next.columns[3].owedCents).toBe(0)
  })

  it('moves an older owing job out of its list', () => {
    const late = job('c', 'done', 3000)
    const withOlder = {
      ...board,
      columns: board.columns.map((item) =>
        item.group === 'done'
          ? { ...item, olderOwing: [late], total: 1, owedCents: 3000 }
          : item,
      ),
    } as never as Parameters<typeof moveOnBoard>[0]
    const next = moveOnBoard(withOlder, 'c' as never, 's1' as never, 99)!
    const [fresh, , done] = next.columns
    expect(done.olderOwing).toEqual([])
    expect(done.total).toBe(0)
    expect(done.owedCents).toBe(0)
    expect(fresh.jobs.map((item) => item._id)).toContain('c')
  })

  it('does nothing for an unknown job or stage', () => {
    expect(moveOnBoard(board, 'zz' as never, 's3' as never, 1)).toBeUndefined()
    expect(moveOnBoard(board, 'a' as never, 'zz' as never, 1)).toBeUndefined()
  })
})
