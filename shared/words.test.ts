import { describe, expect, it } from 'vitest'
import { guessPlural, isValidWord } from './words'

describe('guessPlural', () => {
  it.each([
    ['Урок', 'Уроци'],
    ['Сеанс', 'Сеанси'],
    ['Поръчка', 'Поръчки'],
    ['Посещение', 'Посещения'],
    ['Ремонт', 'Ремонти'],
    ['Почистване', 'Почиствания'],
    ['Задача', 'Задачи'],
    ['Кутия', 'Кутии'],
    ['', ''],
  ])('%s → %s', (one, many) => {
    expect(guessPlural(one)).toBe(many)
  })
})

describe('isValidWord', () => {
  it('needs both forms, trimmed, and a gender', () => {
    expect(
      isValidWord({ singular: 'Ремонт', plural: 'Ремонти', gender: 'm' }),
    ).toBe(true)
    expect(isValidWord({ singular: ' ', plural: 'Ремонти', gender: 'm' })).toBe(
      false,
    )
    expect(
      isValidWord({ singular: 'x'.repeat(41), plural: 'Ремонти', gender: 'm' }),
    ).toBe(false)
  })
})
