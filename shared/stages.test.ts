import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  STAGE_GROUPS,
  canRegroupStage,
  canRemoveStage,
  defaultStage,
  firstStageOf,
  groupedOrder,
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
