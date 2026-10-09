import { describe, expect, it } from 'vitest'
import { actorLabel } from './activity'

describe('actorLabel', () => {
  it('keeps a name as it is', () => {
    expect(actorLabel('Ivan Petrov')).toBe('Ivan Petrov')
    expect(actorLabel('')).toBe('')
  })

  it('shortens an email to the part before the @', () => {
    expect(actorLabel('ivan.petrov@example.com')).toBe('ivan.petrov')
  })

  it('leaves a lone @ alone', () => {
    expect(actorLabel('@home')).toBe('@home')
  })
})
