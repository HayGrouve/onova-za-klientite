import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { mapsHref } from './maps'

describe('mapsHref', () => {
  it('is a Google Maps search link that opens the maps app on Android and iOS', () => {
    const url = new URL(mapsHref('София, ул. Златовръх 12'))
    expect(url.origin).toBe('https://www.google.com')
    expect(url.pathname).toBe('/maps/search/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('query')).toBe('София, ул. Златовръх 12')
  })

  it('keeps characters that would end the query early', () => {
    const url = new URL(mapsHref('бл. 5 & 6, вх. А #3'))
    expect(url.searchParams.get('query')).toBe('бл. 5 & 6, вх. А #3')
    expect([...url.searchParams.keys()]).toEqual(['api', 'query'])
  })

  it('trims the address', () => {
    expect(new URL(mapsHref('  Варна  ')).searchParams.get('query')).toBe(
      'Варна',
    )
  })

  it('round-trips any address', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (address) => {
        const url = new URL(mapsHref(address))
        expect(url.searchParams.get('query')).toBe(address.trim())
      }),
    )
  })
})
