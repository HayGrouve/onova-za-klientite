import { describe, expect, it } from 'vitest'
import { REPEAT_CHOICES } from '../../../shared/repeat'
import { repeatLabel } from './repeat-section'

describe('repeatLabel', () => {
  it('names each interval the Job offers', () => {
    expect(
      REPEAT_CHOICES.map(({ every, unit }) => repeatLabel({ every, unit })),
    ).toEqual([
      'Всяка седмица',
      'През седмица',
      'Всеки месец',
      'Всеки 2\u00a0месеца',
      'Всеки 3\u00a0месеца',
      'Всеки 6\u00a0месеца',
      'Всяка година',
    ])
  })

  it('writes an interval the server stores but the screen does not offer in Bulgarian', () => {
    expect(repeatLabel({ every: 3, unit: 'week' })).toBe(
      'На всеки 3\u00a0седмици',
    )
    expect(repeatLabel({ every: 4, unit: 'month' })).toBe(
      'На всеки 4\u00a0месеца',
    )
  })
})
