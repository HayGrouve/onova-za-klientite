import { describe, expect, it } from 'vitest'
import { REMINDER_PICKS } from '../../../shared/reminders'
import { PICK_LABEL } from './date-picks'

describe('PICK_LABEL', () => {
  it('names the quick dates the way a person would say them', () => {
    expect(REMINDER_PICKS.map((pick) => PICK_LABEL[pick]())).toEqual([
      'Утре',
      'След седмица',
      'След месец',
      'След 2 месеца',
      'След 3 месеца',
      'След 6 месеца',
      'След година',
    ])
  })
})
