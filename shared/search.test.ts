import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  buildSearchText,
  foldQuery,
  nameMatches,
  searchClients,
  transliterate,
} from './search'

describe('transliterate', () => {
  it('folds Cyrillic to Latin', () => {
    expect(transliterate('Иван')).toBe('ivan')
    expect(transliterate('Щастие')).toBe('shtastie')
    expect(transliterate('Ivan')).toBe('ivan')
    expect(transliterate('ѝ')).toBe('i')
  })

  it('never leaves Cyrillic behind', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc
            .integer({ min: 0x20, max: 0x52f })
            .map((code) => String.fromCodePoint(code)),
        }),
        (text) => {
          expect(/\p{Script=Cyrillic}/u.test(transliterate(text))).toBe(false)
        },
      ),
    )
  })
})

describe('buildSearchText', () => {
  it('keeps each folded word once, and plain names plain', () => {
    expect(buildSearchText(['Иван Петров', 'Ivan', undefined])).toBe(
      'ivan petrov',
    )
  })
})

describe('client matching', () => {
  const clients = [
    { id: '1', name: 'Иван Петров', phones: ['+359888123456'] },
    { id: '2', name: 'Христо Иванов', phones: [] },
    { id: '3', name: 'Мария Георгиева', phones: ['+359887654321'] },
  ]

  it('matches Latin and Cyrillic, word starts, any order', () => {
    expect(searchClients(clients, 'iv pet').map((c) => c.id)).toEqual(['1'])
    expect(searchClients(clients, 'Ivan').map((c) => c.id)).toEqual(['1', '2'])
    expect(searchClients(clients, 'xristo').map((c) => c.id)).toEqual(['2'])
    expect(searchClients(clients, 'Петров Иван').map((c) => c.id)).toEqual([
      '1',
    ])
  })

  it('matches a phone typed the local way', () => {
    expect(searchClients(clients, '0888 123').map((c) => c.id)).toEqual(['1'])
    expect(searchClients(clients, '654321').map((c) => c.id)).toEqual(['3'])
  })

  it('needs something to match', () => {
    expect(searchClients(clients, '  ')).toEqual([])
    expect(nameMatches('', 'Иван')).toBe(false)
  })
})

describe('search keys (milestone 8)', () => {
  // Stored keys and a folded query match the way Convex search does: every
  // query word but the last must equal a key, the last may be a prefix.
  const finds = (stored: string, query: string) => {
    const keys = buildSearchText([stored]).split(' ')
    return foldQuery(query).some((variant) => {
      const words = variant.split(' ').filter(Boolean)
      return words.every((word, index) =>
        index === words.length - 1
          ? keys.some((key) => key.startsWith(word))
          : keys.includes(word),
      )
    })
  }

  it('Ivan ↔ Иван', () => {
    expect(finds('Иван Петров', 'Ivan')).toBe(true)
    expect(finds('Ivan Petrov', 'Иван')).toBe(true)
    expect(finds('Иван Петров', 'иван петр')).toBe(true)
  })

  it('CA1234BP ↔ СА 1234 ВР, either way, spaces or not', () => {
    expect(finds('СА 1234 ВР', 'CA1234BP')).toBe(true)
    expect(finds('СА 1234 ВР', 'ca 1234 bp')).toBe(true)
    expect(finds('СА 1234 ВР', 'СА1234ВР')).toBe(true)
    expect(finds('CA1234BP', 'СА 1234 ВР')).toBe(true)
    expect(finds('CA 1234 BP', 'ca1234')).toBe(true)
  })

  it('a phone is found the local way too', () => {
    expect(finds('+359888123456', '0888123456')).toBe(true)
    expect(finds('+359888123456', '888123')).toBe(false)
    expect(finds('+359888123456', '0888')).toBe(true)
  })

  it('keeps keys short enough for Convex (32 bytes)', () => {
    const keys = buildSearchText([
      'Металообработващ цех Петров и синове ЕООД',
    ]).split(' ')
    for (const key of keys)
      expect(new TextEncoder().encode(key).length).toBeLessThanOrEqual(32)
  })
})
