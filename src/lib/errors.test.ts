import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { errorCode, errorMessage, isNotFound } from './errors'

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

describe('isNotFound', () => {
  it('is true for a record the server says is missing or belongs to someone else', () => {
    expect(
      isNotFound(new ConvexError({ code: 'notFound', table: 'jobs' })),
    ).toBe(true)
  })

  it('is true when the address held something that is not an id at all', () => {
    expect(
      isNotFound(
        new Error(
          '[Request ID: abc] Server Error\nArgumentValidationError: Value does not match validator.\nPath: .jobId\nValue: "nope"\nValidator: v.id("jobs")',
        ),
      ),
    ).toBe(true)
    expect(
      isNotFound(
        new Error(
          'Found ID "x" from table `clients`, which does not match the table name in validator `v.id("jobs")`.',
        ),
      ),
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
