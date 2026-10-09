import { describe, expect, it } from 'vitest'
import { sameExceptNow } from './use-query-keep-previous'

describe('sameExceptNow', () => {
  it('is true when only now differs', () => {
    expect(
      sameExceptNow({ businessId: 'b', now: 1 }, { businessId: 'b', now: 2 }),
    ).toBe(true)
    expect(
      sameExceptNow({ businessId: 'b' }, { businessId: 'b', now: 2 }),
    ).toBe(true)
  })

  it('is false when another argument differs', () => {
    expect(
      sameExceptNow(
        { businessId: 'b', group: 'new', now: 1 },
        { businessId: 'b', group: 'done', now: 1 },
      ),
    ).toBe(false)
    expect(
      sameExceptNow({ businessId: 'a', now: 1 }, { businessId: 'b', now: 1 }),
    ).toBe(false)
    expect(
      sameExceptNow({ businessId: 'b' }, { businessId: 'b', group: 'x' }),
    ).toBe(false)
  })
})
