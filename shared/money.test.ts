import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  isCents,
  lineTotalCents,
  parseMoney,
  sumCents,
} from './money'

describe('parseMoney', () => {
  it.each([
    ['1200', 120000],
    ['1 200', 120000],
    ['1 200', 120000],
    ['1 200', 120000],
    ['1200,50', 120050],
    ['1200.50', 120050],
    ['1.200,50', 120050],
    ['1,200.50', 120050],
    ['1.200', 120000],
    ['1,200', 120000],
    ['1,200,000', 120000000],
    ['950€', 95000],
    ['950 €', 95000],
    ['950 €', 95000],
    ['950 евро', 95000],
    ['€ 950', 95000],
    ['€950', 95000],
    ['950 EUR', 95000],
    ['-950', -95000],
    ['-950,5', -95050],
    ['-€ 950', -95000],
    ['€ -950', -95000],
    ['−950 €', -95000],
    ['0,05', 5],
    ['0', 0],
    ['-0', 0],
    ['  12,3 ', 1230],
    ['12 000,00 €', 1200000],
  ])('parses %j as %j cents', (input, cents) => {
    expect(parseMoney(input)).toBe(cents)
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['12abc'],
    ['€'],
    ['-'],
    ['1,2,3'],
    ['1200,505'],
    ['1200.505'],
    ['1,200.505'],
    ['1.200.50'],
    ['950,'],
    [',50'],
    ['--5'],
    ['5-'],
    ['9'.repeat(30)],
  ])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull()
  })

  it('does not return -0', () => {
    expect(Object.is(parseMoney('-0,00'), 0)).toBe(true)
  })

  it('round-trips with formatMoney', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }),
        (cents) => {
          expect(parseMoney(formatMoney(cents))).toBe(cents)
        },
      ),
    )
  })

  it('parses plain decimal strings exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 99 }),
        (euros, cents) => {
          const text = `${euros},${String(cents).padStart(2, '0')}`
          expect(parseMoney(text)).toBe(euros * 100 + cents)
        },
      ),
    )
  })
})

describe('formatMoney', () => {
  const norm = (s: string) => s.replace(/\s/g, ' ')

  it('drops zero decimals for whole amounts', () => {
    expect(norm(formatMoney(95000))).toBe('950 €')
    expect(norm(formatMoney(0))).toBe('0 €')
    expect(norm(formatMoney(-95000))).toBe('-950 €')
    expect(norm(formatMoney(1200000))).toBe('12 000 €')
  })

  it('keeps decimals otherwise', () => {
    expect(norm(formatMoney(120050))).toBe('1200,50 €')
    expect(norm(formatMoney(5))).toBe('0,05 €')
    expect(norm(formatMoney(-5))).toBe('-0,05 €')
  })
})

describe('lineTotalCents', () => {
  it('multiplies whole quantities', () => {
    expect(lineTotalCents(3, 1250)).toBe(3750)
  })

  it('rounds half away from zero', () => {
    expect(lineTotalCents(0.5, 5)).toBe(3)
    expect(lineTotalCents(0.5, -5)).toBe(-3)
    expect(lineTotalCents(2.5, 1)).toBe(3)
    expect(lineTotalCents(-2.5, 1)).toBe(-3)
    expect(lineTotalCents(1.4, 1)).toBe(1)
  })

  it('is not fooled by float error just under a half', () => {
    expect(lineTotalCents(2.675, 100)).toBe(268)
    expect(lineTotalCents(1.005, 100)).toBe(101)
  })

  it('always returns an integer', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        (quantity, unit) => {
          expect(Number.isInteger(lineTotalCents(quantity, unit))).toBe(true)
        },
      ),
    )
  })

  it('is within half a cent of the exact product', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: -100_000, max: 100_000 }),
        (hundredths, unit) => {
          const exact = (hundredths * unit) / 100
          expect(
            Math.abs(lineTotalCents(hundredths / 100, unit) - exact),
          ).toBeLessThanOrEqual(0.5 + 1e-6)
        },
      ),
    )
  })
})

describe('sumCents and isCents', () => {
  it('sums', () => {
    expect(sumCents([])).toBe(0)
    expect(sumCents([100, -30, 5])).toBe(75)
  })

  it('recognises integer cents', () => {
    expect(isCents(0)).toBe(true)
    expect(isCents(-12)).toBe(true)
    expect(isCents(1.5)).toBe(false)
    expect(isCents(NaN)).toBe(false)
    expect(isCents(Infinity)).toBe(false)
    expect(isCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
  })
})
