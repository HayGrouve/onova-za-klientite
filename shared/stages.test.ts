import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  STAGE_GROUPS,
  canRegroupStage,
  canRemoveStage,
  defaultStage,
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
