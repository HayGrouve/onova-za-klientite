import { describe, expect, it } from 'vitest'
import { defaultBusiness } from './setup'
import { STAGE_GROUPS, stagesFor } from './stages'

describe('defaultBusiness', () => {
  it('skipping setup gives a working business', () => {
    const business = defaultBusiness()
    expect(business.name).not.toBe('')
    expect(business.words.job.singular).toBe('Поръчка')
    expect(business.modules.appointments).toBe(true)
    expect(business.modules.items).toBe(false)
  })

  it('returns a fresh copy each time', () => {
    const a = defaultBusiness()
    a.words.job.singular = 'Ремонт'
    expect(defaultBusiness().words.job.singular).toBe('Поръчка')
  })
})

describe('stagesFor', () => {
  it.each(['single', 'multi'] as const)(
    '%s flow has a stage in every group',
    (flow) => {
      const groups = new Set(stagesFor(flow).map((stage) => stage.group))
      for (const group of STAGE_GROUPS) expect(groups.has(group)).toBe(true)
    },
  )

  it('starts with a New stage', () => {
    expect(stagesFor('multi')[0].group).toBe('new')
  })
})
