import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safe-redirect'

describe('safeRedirect', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirect('/jobs')).toBe('/jobs')
    expect(safeRedirect('/clients?q=ivan#top')).toBe('/clients?q=ivan#top')
  })

  it.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '',
    undefined,
    42,
  ])('falls back to / for %s', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})
