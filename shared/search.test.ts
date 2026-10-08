import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  asCandidate,
  buildSearchText,
  foldName,
  foldQuery,
  nameMatches,
  searchClients,
  similarClients,
  transliterate,
} from './search'
import type { SearchValue } from './search'

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

// Stored keys and a folded query match the way Convex search does: every
// query word but the last must equal a key, the last may be a prefix.
const findsIn = (stored: SearchValue[], query: string) => {
  const keys = buildSearchText(stored).split(' ')
  return foldQuery(query).some((variant) => {
    const words = variant.split(' ').filter(Boolean)
    return (
      words.length > 0 &&
      words.every((word, index) =>
        index === words.length - 1
          ? keys.some((key) => key.startsWith(word))
          : keys.includes(word),
      )
    )
  })
}
const finds = (stored: string, query: string) => findsIn([stored], query)

describe('search keys (milestone 8)', () => {
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
    expect(finds('+359888123456', '888123')).toBe(true)
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

describe('name spellings (friction pass)', () => {
  // One Cyrillic name and the Latin spellings people really type for it.
  const SPELLINGS: Array<[string, ...string[]]> = [
    ['Мария', 'Maria', 'Mariya', 'Mariia'],
    ['Николай', 'Nikolai', 'Nikolay'],
    ['Георги', 'Georgi', 'Georgy'],
    ['Йордан', 'Yordan', 'Jordan', 'Iordan'],
    ['Христо', 'Hristo', 'Christo', 'Xristo', 'Khristo'],
    ['Живко', 'Zhivko', 'Jivko'],
    ['Цветан', 'Tsvetan', 'Cvetan', 'Tzvetan'],
    ['Стоян', 'Stoyan', 'Stoian'],
    ['Юлия', 'Yulia', 'Julia', 'Iulia', 'Yuliya'],
    ['Петър', 'Petar', 'Peter', 'Petur', 'Petyr'],
    ['Александър', 'Aleksandar', 'Alexander', 'Aleksandur'],
    ['Любомир', 'Lyubomir', 'Lubomir', 'Liubomir'],
  ]

  it.each(SPELLINGS)('%s is found by every spelling, both ways', (...names) => {
    for (const stored of names) {
      for (const query of names) {
        expect(finds(stored, query), `${query} should find ${stored}`).toBe(
          true,
        )
      }
    }
  })

  it('finds a full name by one Latin spelling, in any order', () => {
    expect(finds('Мария Иванова', 'Maria')).toBe(true)
    expect(finds('Мария Иванова', 'Maria Ivanova')).toBe(true)
    expect(finds('Мария Иванова', 'ivanova maria')).toBe(true)
    expect(finds('Maria Ivanova', 'Мария')).toBe(true)
    expect(finds('Йордан Стоянов', 'Jordan Stoyanov')).toBe(true)
  })

  it('finds a name from its first letters, typed any Latin way', () => {
    expect(finds('Мария', 'Mar')).toBe(true)
    expect(finds('Мария', 'Mari')).toBe(true)
    expect(finds('Мария', 'Mariy')).toBe(true)
    expect(finds('Николай', 'Nikola')).toBe(true)
    expect(finds('Христо', 'Chris')).toBe(true)
    expect(finds('Цветан', 'Cvet')).toBe(true)
    expect(finds('Александър', 'Alexa')).toBe(true)
  })

  it('does not run different names together', () => {
    expect(finds('Иван Петров', 'Maria')).toBe(false)
    expect(finds('Георги', 'Nikolai')).toBe(false)
    expect(finds('Стоян', 'Ivan')).toBe(false)
    expect(finds('Мария', 'Marin')).toBe(false)
    expect(finds('Йордан', 'Zhordan')).toBe(false)
  })

  it('keeps one key per word of a plain name', () => {
    expect(buildSearchText(['Мария Иванова'])).toBe('maria ivanova')
    expect(buildSearchText(['Мария Иванова', 'Maria Ivanova'])).toBe(
      'maria ivanova',
    )
    expect(buildSearchText(['Христо Йорданов'])).toBe('hristo iordanov')
  })

  it('the Clients list and pickers match the same spellings', () => {
    expect(nameMatches('Maria', 'Мария Иванова')).toBe(true)
    expect(nameMatches('Nikolai', 'Николай Стоянов')).toBe(true)
    expect(nameMatches('Alexander', 'Александър Петров')).toBe(true)
    expect(nameMatches('Christo', 'Христо Йорданов')).toBe(true)
    expect(nameMatches('Maria', 'Иван Петров')).toBe(false)
    expect(foldName('Xristo')).toBe(foldName('Христо'))
  })

  it('a name finds its own Latin form and the other way round', () => {
    const cyrillicName = fc
      .array(fc.constantFrom(...'абвгдежзийклмнопрстуфхцчшщъюя'.split('')), {
        minLength: 2,
        maxLength: 12,
      })
      .map((letters) => letters.join(''))
    fc.assert(
      fc.property(
        fc.array(cyrillicName, { minLength: 1, maxLength: 3 }),
        (names) => {
          const cyrillic = names.join(' ')
          const latin = transliterate(cyrillic)
          expect(finds(cyrillic, cyrillic)).toBe(true)
          expect(finds(cyrillic, latin)).toBe(true)
          expect(finds(latin, cyrillic)).toBe(true)
          expect(nameMatches(latin, cyrillic)).toBe(true)
          expect(nameMatches(cyrillic, latin)).toBe(true)
        },
      ),
    )
  })

  it('never makes more than one key per word, and every key fits Convex', () => {
    const letters = 'абвгдежзийклмнопрстуфхцчшщъюяabcdefghijklmnopqrstuvwxyz -'
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...letters.split('')),
          maxLength: 80,
        }),
        (text) => {
          const keys = buildSearchText([text]).split(' ').filter(Boolean)
          const wordCount = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length
          expect(keys.length).toBeLessThanOrEqual(wordCount)
          for (const key of keys)
            expect(new TextEncoder().encode(key).length).toBeLessThanOrEqual(32)
        },
      ),
    )
  })
})

describe('phone keys (friction pass)', () => {
  const stored = '+359899314159'

  it('finds a number by its last digits', () => {
    expect(finds(stored, '4159')).toBe(true)
    expect(finds(stored, '14159')).toBe(true)
    expect(finds(stored, '314159')).toBe(true)
    expect(finds(stored, '314 159')).toBe(true)
  })

  it('finds a number by a run from the middle', () => {
    expect(finds('+359887123456', '123456')).toBe(true)
    expect(finds('+359887123456', '8712')).toBe(true)
    expect(finds('+359887123456', '871 234')).toBe(true)
    expect(finds('+359887123456', '1234')).toBe(true)
  })

  it('finds a number without its leading 0, with or without spaces', () => {
    expect(finds(stored, '899314159')).toBe(true)
    expect(finds(stored, '899 314 159')).toBe(true)
    expect(finds('+359876555666', '876555666')).toBe(true)
    expect(finds('+359876555666', '876 555')).toBe(true)
  })

  it('still finds a number from its start, in either form', () => {
    expect(finds(stored, '0899')).toBe(true)
    expect(finds(stored, '0899 314 159')).toBe(true)
    expect(finds(stored, '+359 89 931')).toBe(true)
    expect(finds(stored, '+359899314159')).toBe(true)
    expect(finds(stored, '359 899')).toBe(true)
  })

  it('finds the middle-of-number query from the desktop simulation', () => {
    expect(finds('+359888890123', '888')).toBe(true)
    expect(finds('+359888890123', '+359 88 889 0123')).toBe(true)
    expect(finds('+359888890123', '889 0123')).toBe(true)
    expect(finds('+359888890123', '88 889')).toBe(true)
  })

  it('does not find a number that is not there', () => {
    expect(finds(stored, '4158')).toBe(false)
    expect(finds(stored, '0877')).toBe(false)
    expect(finds(stored, '899314158')).toBe(false)
    expect(finds(stored, '9314158')).toBe(false)
  })

  it('a landline and a foreign number work the same way', () => {
    expect(finds('+35921234567', '4567')).toBe(true)
    expect(finds('+35921234567', '21234567')).toBe(true)
    expect(finds('+35921234567', '02 123 4567')).toBe(true)
    expect(finds('+447911123456', '7911123456')).toBe(true)
    expect(finds('+447911123456', '3456')).toBe(true)
    expect(finds('+447911123456', '+44 7911')).toBe(true)
  })

  it('adds a handful of keys per number, none shorter than 4 digits', () => {
    const keys = buildSearchText([stored]).split(' ')
    // 359…, the local 0… form, and the endings of the 9-digit national number.
    expect(keys.sort()).toEqual(
      [
        '359899314159',
        '0899314159',
        '899314159',
        '99314159',
        '9314159',
        '314159',
        '14159',
        '4159',
      ].sort(),
    )
    expect(buildSearchText(['+35921234567']).split(' ')).toHaveLength(7)
  })

  it('every run of 4 or more digits of a number finds it', () => {
    const mobile = fc
      .tuple(
        fc.constantFrom('87', '88', '89', '98'),
        fc.stringMatching(/^[0-9]{7}$/),
      )
      .map(([prefix, rest]) => `${prefix}${rest}`)
    fc.assert(
      fc.property(
        mobile,
        fc.nat(5),
        fc.integer({ min: 4, max: 9 }),
        (national, start, length) => {
          const run = national.slice(start, start + length)
          fc.pre(run.length >= 4)
          expect(findsIn([`+359${national}`], run)).toBe(true)
          expect(findsIn([`+359${national}`], `0${national}`)).toBe(true)
          expect(findsIn([`+359${national}`], national.slice(-4))).toBe(true)
        },
      ),
    )
  })

  it('keeps the number of keys small, whatever the number', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\+[1-9][0-9]{9,14}$/), (phone) => {
        const keys = buildSearchText([phone]).split(' ')
        expect(keys.length).toBeLessThanOrEqual(13)
        for (const key of keys) expect(key.length).toBeGreaterThanOrEqual(4)
      }),
    )
  })
})

describe('plain values (addresses)', () => {
  const address = { plain: 'София, кв. Лозенец, ул. Златовръх 12' }

  it('finds a client by a street, a district or a house number', () => {
    expect(findsIn(['Иван Петров', address], 'Златовръх')).toBe(true)
    expect(findsIn(['Иван Петров', address], 'zlatovrah')).toBe(true)
    expect(findsIn(['Иван Петров', address], 'ул. Златовръх 12')).toBe(true)
    expect(findsIn(['Иван Петров', address], 'Lozenets')).toBe(true)
    expect(findsIn(['Иван Петров', address], 'Sofia')).toBe(true)
    expect(findsIn(['Иван Петров', address], 'Златовр')).toBe(true)
    expect(findsIn(['Иван Петров', address], 'Младост')).toBe(false)
  })

  it('reads digits as words only: no plate folds, no spaceless copy', () => {
    expect(buildSearchText([{ plain: 'ул. Златовръх 12' }])).toBe(
      'ul zlatovrah 12',
    )
  })

  it('an empty address adds nothing', () => {
    expect(buildSearchText(['Иван', undefined, { plain: '' }])).toBe('ivan')
  })
})

describe('key limits', () => {
  it('stops at a fixed number of keys, so a long note cannot break the index', () => {
    const note = Array.from({ length: 2000 }, (_, i) => `дума${i}`).join(' ')
    const keys = buildSearchText(['Иван', '+359899314159', note]).split(' ')
    expect(keys.length).toBeLessThanOrEqual(512)
    expect(keys).toContain('ivan')
    expect(keys).toContain('4159')
  })
})

describe('similarClients', () => {
  const clients = [
    { id: 'ivan', name: 'Иван Петров', phones: [] },
    { id: 'maria', name: 'Мария Георгиева', phones: [] },
  ]

  it('finds a name a typo or two away', () => {
    expect(similarClients(clients, 'Иван Петрв').map((c) => c.id)).toEqual([
      'ivan',
    ])
    expect(similarClients(clients, 'Мраия Георгиева').map((c) => c.id)).toEqual(
      ['maria'],
    )
  })

  it('reads a single word against each word of a name', () => {
    expect(similarClients(clients, 'Петрв').map((c) => c.id)).toEqual(['ivan'])
  })

  it('finds nobody for a short name or a different one', () => {
    expect(similarClients(clients, 'Ана')).toEqual([])
    expect(similarClients(clients, 'Петър Колев')).toEqual([])
  })

  it('lists the closest first, at most three', () => {
    const many = [
      { id: 'd', name: 'Георги Иванова', phones: [] },
      { id: 'c', name: 'Георги Иванво', phones: [] },
      { id: 'b', name: 'Георги Иваноув', phones: [] },
      { id: 'a', name: 'Георги Иванов', phones: [] },
    ]
    const found = similarClients(many, 'Георги Иванво').map((c) => c.id)
    expect(found).toHaveLength(3)
    expect(found[0]).toBe('c')
  })
})

describe('asCandidate', () => {
  it('searches a list row by its first phone, or by name alone', () => {
    expect(
      asCandidate({ _id: 'a', name: 'Иван', phone: '+359888' }),
    ).toMatchObject({
      id: 'a',
      phones: ['+359888'],
    })
    expect(asCandidate({ _id: 'b', name: 'Ана' }).phones).toEqual([])
  })
})
