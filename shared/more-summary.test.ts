import { describe, expect, it } from 'vitest'
import { summarizeMore } from './more-summary'

describe('summarizeMore', () => {
  it('puts the parts that hold something first, in their order', () => {
    const { shown } = summarizeMore(
      [
        { name: 'Visits', count: 0 },
        { name: 'Lines', count: 2 },
        { name: 'Repeat' },
        { name: 'History', count: 5 },
      ],
      4,
    )
    expect(shown.map((part) => part.name)).toEqual([
      'Lines',
      'History',
      'Visits',
      'Repeat',
    ])
  })

  it('cuts to three and counts the rest', () => {
    const parts = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, count: 1 }))
    const { shown, hidden } = summarizeMore(parts)
    expect(shown).toHaveLength(3)
    expect(hidden).toBe(2)
  })

  it('hides nothing when everything fits', () => {
    expect(summarizeMore([{ name: 'a' }, { name: 'b' }]).hidden).toBe(0)
    expect(summarizeMore([]).shown).toEqual([])
  })
})
