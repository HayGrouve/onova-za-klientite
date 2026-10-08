import { describe, expect, it } from 'vitest'
import { REPEAT_CHOICES } from '../../../shared/repeat'
import { REMINDER_MONTHS } from '../../../shared/setup'
import { REPEAT_LABEL, monthsLabel } from './steps'

describe('monthsLabel', () => {
  it('says month, months and year the way a person would', () => {
    expect(monthsLabel(1)).toBe('След месец')
    expect(monthsLabel(2)).toBe('След 2\u00a0месеца')
    expect(monthsLabel(3)).toBe('След 3\u00a0месеца')
    expect(monthsLabel(6)).toBe('След 6\u00a0месеца')
    expect(monthsLabel(12)).toBe('След година')
    expect(monthsLabel(24)).toBe('След 2\u00a0години')
  })

  it('has a distinct label for every delay setup offers', () => {
    const labels = REMINDER_MONTHS.map((months) => monthsLabel(months))
    expect(new Set(labels).size).toBe(REMINDER_MONTHS.length)
  })
})

describe('REPEAT_LABEL', () => {
  it('names every interval a job can repeat on', () => {
    expect(REPEAT_CHOICES.map(({ key }) => REPEAT_LABEL[key]())).toEqual([
      'Всяка седмица',
      'През седмица',
      'Всеки месец',
      'Всеки 2\u00a0месеца',
      'Всеки 3\u00a0месеца',
      'Всеки 6\u00a0месеца',
      'Всяка година',
    ])
  })
})
