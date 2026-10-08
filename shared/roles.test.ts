import { describe, expect, it } from 'vitest'
import { hasRole } from './roles'

describe('hasRole', () => {
  it('lets a role do what it or any role below it may do', () => {
    expect(hasRole('owner', 'manager')).toBe(true)
    expect(hasRole('manager', 'manager')).toBe(true)
    expect(hasRole('worker', 'manager')).toBe(false)
    expect(hasRole('manager', 'owner')).toBe(false)
  })
})
