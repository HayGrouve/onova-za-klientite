import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  buildSearchText,
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
  it('keeps each folded word once', () => {
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
