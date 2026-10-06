import { describe, expect, it } from 'vitest'
import {
  FIELD_TYPES,
  canChangeFieldType,
  fieldSearchText,
  validateFieldValue,
} from './fields'

const choice = {
  type: 'choice' as const,
  options: [
    { id: 'o1', name: 'Спокоен' },
    { id: 'o2', name: 'Хапе', archivedAt: 1 },
  ],
}

describe('canChangeFieldType', () => {
  it("a field's type can change only between text and long text", () => {
    expect(canChangeFieldType('text', 'longText')).toBe(true)
    expect(canChangeFieldType('longText', 'text')).toBe(true)
    for (const from of FIELD_TYPES) {
      for (const to of FIELD_TYPES) {
        const textPair =
          new Set([from, to]).size === 2 &&
          [from, to].every((t) => t === 'text' || t === 'longText')
        expect(canChangeFieldType(from, to)).toBe(from === to || textPair)
      }
    }
  })
})

describe('validateFieldValue', () => {
  it.each([
    [{ type: 'text' as const }, 'Daikin', true],
    [{ type: 'text' as const }, 5, false],
    [{ type: 'text' as const }, 'x'.repeat(501), false],
    [{ type: 'longText' as const }, 'ред\nред', true],
    [{ type: 'number' as const }, 120000, true],
    [{ type: 'number' as const }, Number.NaN, false],
    [{ type: 'money' as const }, 4000, true],
    [{ type: 'money' as const }, 40.5, false],
    [{ type: 'date' as const }, '2026-10-20', true],
    [{ type: 'date' as const }, '20.10.2026', false],
    [{ type: 'yesNo' as const }, true, true],
    [{ type: 'yesNo' as const }, 'да', false],
    [choice, 'o1', true],
    [choice, 'missing', false],
    [{ type: 'photo' as const }, 'kg2abc', true],
  ])('%o accepts %o: %s', (field, value, ok) => {
    expect(validateFieldValue(field, value)).toBe(ok)
  })

  it('choice options are stored by id; an archived option is not offered for new values', () => {
    expect(validateFieldValue(choice, 'o2')).toBe(false)
    expect(validateFieldValue(choice, 'o2', { allowArchived: true })).toBe(true)
  })
})

describe('fieldSearchText', () => {
  it('uses the option name for choices, so a rename is found after a rebuild', () => {
    expect(fieldSearchText(choice, 'o1')).toBe('Спокоен')
    expect(fieldSearchText({ type: 'text' }, 'CA1234BP')).toBe('CA1234BP')
    expect(fieldSearchText({ type: 'yesNo' }, true)).toBe('')
    expect(fieldSearchText({ type: 'photo' }, 'kg2abc')).toBe('')
  })
})
