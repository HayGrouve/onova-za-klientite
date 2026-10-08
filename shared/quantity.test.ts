import { describe, expect, it } from 'vitest'
import { formatQuantity } from './quantity'

describe('formatQuantity', () => {
  it('writes whole quantities without a decimal part', () => {
    expect(formatQuantity(1)).toBe('1')
    expect(formatQuantity(12)).toBe('12')
  })

  it('uses a decimal comma', () => {
    expect(formatQuantity(2.5)).toBe('2,5')
    expect(formatQuantity(0.25)).toBe('0,25')
  })

  it('never groups, so what is shown can be typed back', () => {
    expect(formatQuantity(1000.5)).toBe('1000,5')
    expect(formatQuantity(1234567)).toBe('1234567')
  })

  it('keeps small fractions', () => {
    expect(formatQuantity(0.001)).toBe('0,001')
  })
})
