import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '../../shared/errors'
import { errorCode, errorMessage, isNotFound } from './errors'

describe('errorMessage', () => {
  it('maps a known code to its message', () => {
    const error = new ConvexError({ code: 'auth.notMember' })
    expect(errorCode(error)).toBe('auth.notMember')
    expect(errorMessage(error)).not.toBe(errorMessage(new Error('x')))
  })

  it('has its own message for every code the server throws', () => {
    const fallback = errorMessage(new Error('boom'))
    for (const code of ERROR_CODES) {
      expect(errorMessage(new ConvexError({ code })), code).not.toBe(fallback)
    }
  })

  it('falls back for plain errors and unknown codes', () => {
    const fallback = errorMessage(new Error('boom'))
    expect(errorMessage(new ConvexError({ code: 'nope' }))).toBe(fallback)
    expect(errorCode(new Error('boom'))).toBeUndefined()
  })
})

describe('isNotFound', () => {
  it('is true for a record the server says is missing or belongs to someone else', () => {
    expect(
      isNotFound(new ConvexError({ code: 'notFound', table: 'jobs' })),
    ).toBe(true)
  })

  it('is false for every other error, so real problems still say so', () => {
    expect(isNotFound(new ConvexError({ code: 'auth.notMember' }))).toBe(false)
    expect(isNotFound(new ConvexError({ code: 'invalid' }))).toBe(false)
    expect(isNotFound(new Error('[Request ID: abc] Server Error'))).toBe(false)
    expect(isNotFound('notFound')).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
  })
})
