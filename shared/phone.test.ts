import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, telHref, viberHref } from './phone'

describe('normalizePhone', () => {
  it.each([
    ['0888 123 456', '+359888123456'],
    ['0888123456', '+359888123456'],
    ['+359 888 123 456', '+359888123456'],
    ['+359 2 987 6543', '+35929876543'],
    ['02 987 6543', '+35929876543'],
    ['00359888123456', '+359888123456'],
    ['(0888) 123-456', '+359888123456'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalizes %j to %j', (input, e164) => {
    expect(normalizePhone(input)).toBe(e164)
  })

  it.each([[''], ['abc'], ['123'], ['0888 12'], ['+359 888'], ['0000000000']])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input)).toBeNull()
    },
  )
})

describe('formatting and links', () => {
  it('formats internationally', () => {
    expect(formatPhone('+359888123456')).toBe('+359 88 812 3456')
  })

  it('falls back to the input when it cannot be parsed', () => {
    expect(formatPhone('nonsense')).toBe('nonsense')
  })

  it('builds tel and Viber links', () => {
    expect(telHref('+359888123456')).toBe('tel:+359888123456')
    expect(viberHref('+359888123456')).toBe(
      'viber://chat?number=%2B359888123456',
    )
  })
})
