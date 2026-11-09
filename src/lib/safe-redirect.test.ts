import { describe, expect, it } from 'vitest'
import { safeRedirect, signInReturnUrl } from './safe-redirect'

describe('safeRedirect', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirect('/jobs')).toBe('/jobs')
    expect(safeRedirect('/clients?q=ivan#top')).toBe('/clients?q=ivan#top')
  })

  it.each([
    '//evil.example',
    '/\\evil.example',
    '/.//evil.example',
    '/..//evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '',
    undefined,
    42,
  ])('falls back to / for %s', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})

describe('signInReturnUrl', () => {
  const origin = 'https://klientite.onovaza.com'

  it('makes the path absolute on this app', () => {
    expect(signInReturnUrl('/jobs/abc?tab=money#pay', origin)).toBe(
      'https://klientite.onovaza.com/jobs/abc?tab=money#pay',
    )
    expect(signInReturnUrl('/', 'http://localhost:3000')).toBe(
      'http://localhost:3000/',
    )
  })

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example', 42])(
    'stays on this app for %s',
    (value) => {
      expect(signInReturnUrl(value, origin)).toBe(
        'https://klientite.onovaza.com/',
      )
    },
  )
})
