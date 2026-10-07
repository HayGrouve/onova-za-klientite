import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { errorCode, errorMessage } from './errors'

describe('errorMessage', () => {
  it('maps a known code to its message', () => {
    const error = new ConvexError({ code: 'auth.notMember' })
    expect(errorCode(error)).toBe('auth.notMember')
    expect(errorMessage(error)).not.toBe(errorMessage(new Error('x')))
  })

  it('falls back for plain errors and unknown codes', () => {
    const fallback = errorMessage(new Error('boom'))
    expect(errorMessage(new ConvexError({ code: 'nope' }))).toBe(fallback)
    expect(errorCode(new Error('boom'))).toBeUndefined()
  })
})
