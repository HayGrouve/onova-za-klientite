import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildSearchText, transliterate } from './search'

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
