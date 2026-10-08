import { describe, expect, it } from 'vitest'
import { formatQuantity, parseDecimal, parseQuantity } from './quantity'

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

describe('parseDecimal', () => {
  it('reads plain numbers with a comma or a point', () => {
    expect(parseDecimal('12')).toBe(12)
    expect(parseDecimal('2,5')).toBe(2.5)
    expect(parseDecimal('2.5')).toBe(2.5)
    expect(parseDecimal(' 0,25 ')).toBe(0.25)
    expect(parseDecimal(',5')).toBe(0.5)
    expect(parseDecimal('-3,5')).toBe(-3.5)
  })

  it('ignores spaces used for thousands', () => {
    expect(parseDecimal('1 200,5')).toBe(1200.5)
  })

  it('accepts a separator typed but not yet followed by digits', () => {
    expect(parseDecimal('2,')).toBe(2)
  })

  it.each(['1e3', '1E3', '0x10', '0b11', 'Infinity', 'NaN', '1_000', '+5'])(
    'refuses "%s", which Number() would read',
    (text) => {
      expect(parseDecimal(text)).toBeNull()
    },
  )

  it.each(['', ' ', 'abc', '1,2,3', '1.2.3', '--1', '1-', '12 кг', '.', ','])(
    'refuses "%s"',
    (text) => {
      expect(parseDecimal(text)).toBeNull()
    },
  )
})

describe('parseQuantity', () => {
  it('needs more than nothing', () => {
    expect(parseQuantity('2,5')).toBe(2.5)
    expect(parseQuantity('0')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('1e3')).toBeNull()
    expect(parseQuantity('')).toBeNull()
  })
})
