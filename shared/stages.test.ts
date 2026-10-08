import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  STAGE_GROUPS,
  canRegroupStage,
  canRemoveStage,
  defaultStage,
  enterGroup,
  firstStageOf,
  groupedOrder,
  isJobLate,
  isOpenGroup,
  lastDoneAt,
  stagesFor,
} from './stages'
import type { StageGroup } from './stages'

const list = (groups: StageGroup[]) =>
  groups.map((group, order) => ({ _id: `s${order}`, group, order }))

describe('canRemoveStage', () => {
  const stages = list([
    'new',
    'in_progress',
    'in_progress',
    'done',
    'cancelled',
  ])

  it('a stage with jobs in it cannot be deleted until its jobs move', () => {
    expect(canRemoveStage(stages, 's1', 12)).toBe('hasJobs')
  })

  it('New, In progress and Done each keep at least one stage', () => {
    expect(canRemoveStage(stages, 's0', 0)).toBe('lastInGroup')
    expect(canRemoveStage(stages, 's3', 0)).toBe('lastInGroup')
    expect(canRemoveStage(stages, 's1', 0)).toBe('ok')
  })

  it('Cancelled may be left empty', () => {
    expect(canRemoveStage(stages, 's4', 0)).toBe('ok')
  })
})

describe('canRegroupStage', () => {
  it('moving the last stage out of a required group is blocked', () => {
    const stages = list(['new', 'in_progress', 'done'])
    expect(canRegroupStage(stages, 's0', 'in_progress')).toBe('lastInGroup')
    expect(canRegroupStage(stages, 's0', 'new')).toBe('ok')
  })
})

describe('defaultStage', () => {
  it('is the first New stage by order', () => {
    const stages = [
      { _id: 'b', group: 'new' as const, order: 3 },
      { _id: 'a', group: 'in_progress' as const, order: 0 },
      { _id: 'c', group: 'new' as const, order: 1 },
    ]
    expect(defaultStage(stages)?._id).toBe('c')
  })

  it('every starting stage list has one', () => {
    for (const flow of ['single', 'multi'] as const) {
      const stages = stagesFor(flow).map((stage, order) => ({
        ...stage,
        _id: String(order),
        order,
      }))
      expect(defaultStage(stages)?.group).toBe('new')
    }
  })
})

describe('firstStageOf', () => {
  it('is the first stage of the group by order, not by position in the list', () => {
    const stages = [
      { _id: 'late', group: 'done' as const, order: 5 },
      { _id: 'new', group: 'new' as const, order: 0 },
      { _id: 'early', group: 'done' as const, order: 3 },
    ]
    expect(firstStageOf(stages, 'done')?._id).toBe('early')
    expect(firstStageOf(stages, 'cancelled')).toBeUndefined()
  })

  it('every starting stage list has a Done stage', () => {
    for (const flow of ['single', 'multi'] as const) {
      const stages = stagesFor(flow).map((stage, order) => ({
        ...stage,
        _id: String(order),
        order,
      }))
      expect(firstStageOf(stages, 'done')?.group).toBe('done')
    }
  })
})

describe('stage rules hold for any list', () => {
  it('after any allowed removal, every required group still has a stage', () => {
    const group = fc.constantFrom(...STAGE_GROUPS)
    fc.assert(
      fc.property(
        fc.array(group, { minLength: 1, maxLength: 8 }),
        fc.nat(),
        (groups, pick) => {
          const stages = list([...groups, 'new', 'in_progress', 'done'])
          const target = stages[pick % stages.length]
          if (canRemoveStage(stages, target._id, 0) !== 'ok') return
          const rest = stages.filter((stage) => stage._id !== target._id)
          for (const required of ['new', 'in_progress', 'done'] as const) {
            expect(rest.some((stage) => stage.group === required)).toBe(true)
          }
        },
      ),
    )
  })
})

describe('groupedOrder', () => {
  it('keeps each group together, in group order, and the order inside it', () => {
    const stages = list(['in_progress', 'new', 'done', 'in_progress'])
    expect(groupedOrder(stages)).toEqual(['s1', 's0', 's3', 's2'])
  })

  it('puts a regrouped stage at the end of its new group', () => {
    // s1 was New and is now In progress: it follows the stages already there.
    const stages = list(['new', 'in_progress', 'in_progress', 'done'])
    stages[0] = { ...stages[0], group: 'in_progress' }
    expect(
      groupedOrder([...stages, { _id: 's4', group: 'new', order: 4 }], 's0'),
    ).toEqual(['s4', 's1', 's2', 's0', 's3'])
  })

  it('always returns every stage once, grouped', () => {
    const group = fc.constantFrom(...STAGE_GROUPS)
    fc.assert(
      fc.property(
        fc.array(group, { maxLength: 10 }),
        fc.nat(),
        (groups, pick) => {
          const stages = list(groups)
          const moved = stages.length
            ? stages[pick % stages.length]._id
            : undefined
          const ids = groupedOrder(stages, moved)
          expect([...ids].sort()).toEqual(
            stages.map((stage) => stage._id).sort(),
          )
          const rank = ids.map((id) =>
            STAGE_GROUPS.indexOf(
              stages.find((stage) => stage._id === id)!.group,
            ),
          )
          expect(rank).toEqual([...rank].sort((a, b) => a - b))
        },
      ),
    )
  })
})

describe('isOpenGroup', () => {
  it('is New and In progress; Done and Cancelled are closed', () => {
    expect(STAGE_GROUPS.filter(isOpenGroup)).toEqual(['new', 'in_progress'])
  })
})

describe('isJobLate', () => {
  it('is a New or In progress job past its due date', () => {
    expect(
      isJobLate({ stageGroup: 'new', dueDate: '2026-10-05' }, '2026-10-08'),
    ).toBe(true)
    expect(
      isJobLate(
        { stageGroup: 'in_progress', dueDate: '2026-10-07' },
        '2026-10-08',
      ),
    ).toBe(true)
  })

  it('is not late on the due date, or with no due date', () => {
    expect(
      isJobLate({ stageGroup: 'new', dueDate: '2026-10-08' }, '2026-10-08'),
    ).toBe(false)
    expect(isJobLate({ stageGroup: 'new' }, '2026-10-08')).toBe(false)
  })

  it('is never late once Done or Cancelled', () => {
    expect(
      isJobLate({ stageGroup: 'done', dueDate: '2026-10-01' }, '2026-10-08'),
    ).toBe(false)
    expect(
      isJobLate(
        { stageGroup: 'cancelled', dueDate: '2026-10-01' },
        '2026-10-08',
      ),
    ).toBe(false)
  })
})

describe('enterGroup', () => {
  const job = {
    stageGroup: 'in_progress' as StageGroup,
    doneAt: undefined as number | undefined,
    cancelReason: undefined as string | undefined,
  }

  it('records when Done was reached, and keeps it on a move within Done', () => {
    expect(enterGroup(job, 'done', 7).doneAt).toBe(7)
    expect(
      enterGroup({ ...job, stageGroup: 'done', doneAt: 3 }, 'done', 7).doneAt,
    ).toBe(3)
    expect(
      enterGroup({ ...job, stageGroup: 'done', doneAt: 3 }, 'new', 7).doneAt,
    ).toBeUndefined()
  })

  it('keeps a cancel reason only in Cancelled, a new one winning', () => {
    const cancelled = { ...job, cancelReason: 'Отказа' }
    expect(enterGroup(cancelled, 'cancelled', 1).cancelReason).toBe('Отказа')
    expect(enterGroup(cancelled, 'cancelled', 1, 'Друго').cancelReason).toBe(
      'Друго',
    )
    expect(enterGroup(cancelled, 'new', 1).cancelReason).toBeUndefined()
  })

  it('always lands in the group it was given, with doneAt only in Done', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STAGE_GROUPS),
        fc.constantFrom(...STAGE_GROUPS),
        (from, to) => {
          const entered = enterGroup({ ...job, stageGroup: from }, to, 1)
          expect(entered.stageGroup).toBe(to)
          expect(entered.doneAt !== undefined).toBe(to === 'done')
        },
      ),
    )
  })
})

describe('lastDoneAt', () => {
  it('is when the latest job still in Done got there', () => {
    expect(
      lastDoneAt([
        { stageGroup: 'done', doneAt: 5 },
        { stageGroup: 'done', doneAt: 9 },
        // Moved back out of Done: it no longer counts.
        { stageGroup: 'in_progress', doneAt: 12 },
        { stageGroup: 'new' },
      ]),
    ).toBe(9)
    expect(lastDoneAt([{ stageGroup: 'new' }])).toBeUndefined()
  })
})
