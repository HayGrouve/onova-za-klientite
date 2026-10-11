import { describe, expect, it } from 'vitest'
import { namesMatch } from './business'

describe('namesMatch', () => {
  it('takes the name as written', () => {
    expect(namesMatch('Мебели Стоянов', 'Мебели Стоянов')).toBe(true)
  })

  it('ignores case and the spaces around and between words', () => {
    expect(namesMatch('  мебели   СТОЯНОВ ', 'Мебели Стоянов')).toBe(true)
  })

  it('refuses another name, part of it, or nothing', () => {
    expect(namesMatch('Мебели', 'Мебели Стоянов')).toBe(false)
    expect(namesMatch('Мебели Стоянова', 'Мебели Стоянов')).toBe(false)
    expect(namesMatch('', 'Мебели Стоянов')).toBe(false)
    expect(namesMatch('   ', '   ')).toBe(false)
  })

  it('does not take Latin look-alike letters for Cyrillic ones', () => {
    // "Хладина" typed with a Latin X and a.
    expect(namesMatch('Xлaдина', 'Хладина')).toBe(false)
  })
})
