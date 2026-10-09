import { describe, expect, it } from 'vitest'
import {
  clerkFrontendHost,
  contentSecurityPolicy,
} from './content-security-policy.ts'

const key = (prefix: string, host: string) =>
  prefix + Buffer.from(`${host}$`).toString('base64')

describe('clerkFrontendHost', () => {
  it('reads a development instance host from a test key', () => {
    expect(
      clerkFrontendHost(key('pk_test_', 'ideal-owl-12.clerk.accounts.dev')),
    ).toBe('ideal-owl-12.clerk.accounts.dev')
  })

  it('reads a custom domain from a live key', () => {
    expect(clerkFrontendHost(key('pk_live_', 'clerk.example.bg'))).toBe(
      'clerk.example.bg',
    )
  })

  it('accepts base64 with its padding stripped and surrounding spaces', () => {
    const raw = key('pk_live_', 'clerk.example.bg').replace(/=+$/, '')
    expect(clerkFrontendHost(`  ${raw}\n`)).toBe('clerk.example.bg')
  })

  it('returns null for nothing, garbage or a secret key', () => {
    expect(clerkFrontendHost(undefined)).toBeNull()
    expect(clerkFrontendHost('')).toBeNull()
    expect(clerkFrontendHost('not a key')).toBeNull()
    expect(clerkFrontendHost('pk_test_')).toBeNull()
    expect(clerkFrontendHost('pk_test_!!!!')).toBeNull()
    expect(clerkFrontendHost(key('sk_test_', 'clerk.example.bg'))).toBeNull()
  })

  it('returns null when the decoded host is not a bare host name', () => {
    // No trailing "$".
    expect(
      clerkFrontendHost(
        'pk_test_' + Buffer.from('clerk.example.bg').toString('base64'),
      ),
    ).toBeNull()
    // Anything that could add a source or a directive to the policy.
    for (const bad of [
      'x.com; script-src *',
      'x.com *',
      'https://x.com',
      'x.com/path',
      '*.example.bg',
      'localhost',
    ]) {
      expect(clerkFrontendHost(key('pk_live_', bad))).toBeNull()
    }
  })
})

describe('contentSecurityPolicy', () => {
  const directive = (policy: string, name: string) =>
    policy.split('; ').find((part) => part.startsWith(`${name} `)) ?? ''

  it("names the key's host, in the four directives that load Clerk", () => {
    const policy = contentSecurityPolicy(key('pk_live_', 'clerk.example.bg'))
    for (const name of ['script-src', 'connect-src', 'frame-src', 'img-src']) {
      expect(directive(policy, name)).toContain('https://clerk.example.bg')
    }
    expect(policy).not.toContain('clerk.accounts.dev')
  })

  it('falls back to the development wildcard when there is no usable key', () => {
    for (const none of [undefined, '', 'garbage']) {
      const policy = contentSecurityPolicy(none)
      for (const name of [
        'script-src',
        'connect-src',
        'frame-src',
        'img-src',
      ]) {
        expect(directive(policy, name)).toContain(
          'https://*.clerk.accounts.dev',
        )
      }
    }
  })

  it('keeps the sources that do not depend on the instance', () => {
    const policy = contentSecurityPolicy(key('pk_live_', 'clerk.example.bg'))
    expect(directive(policy, 'img-src')).toContain('https://img.clerk.com')
    expect(directive(policy, 'script-src')).toContain(
      'https://challenges.cloudflare.com',
    )
    expect(directive(policy, 'frame-src')).toContain(
      'https://challenges.cloudflare.com',
    )
    expect(directive(policy, 'connect-src')).toContain(
      'https://clerk-telemetry.com',
    )
    expect(policy).toContain("frame-ancestors 'none'")
  })
})
