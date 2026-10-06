import { isValidDate } from './dates'

/** The eight extra field types. Nothing else. */
export const FIELD_TYPES = [
  'text',
  'longText',
  'number',
  'money',
  'date',
  'yesNo',
  'choice',
  'photo',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export type FieldValue = string | number | boolean

export type ChoiceOption = { id: string; name: string; archivedAt?: number }

type FieldShape = { type: FieldType; options?: ChoiceOption[] }

const MAX_TEXT = 500
const MAX_LONG_TEXT = 10_000

/** Only text ↔ long text keeps its data. Any other change is a new field. */
export function canChangeFieldType(from: FieldType, to: FieldType): boolean {
  if (from === to) return true
  const text = new Set<FieldType>(['text', 'longText'])
  return text.has(from) && text.has(to)
}

/** Whether a value fits a field. Archived choice options are kept but not offered. */
export function validateFieldValue(
  field: FieldShape,
  value: unknown,
  { allowArchived = false } = {},
): boolean {
  switch (field.type) {
    case 'text':
      return typeof value === 'string' && value.length <= MAX_TEXT
    case 'longText':
      return typeof value === 'string' && value.length <= MAX_LONG_TEXT
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'money':
      return typeof value === 'number' && Number.isSafeInteger(value)
    case 'date':
      return typeof value === 'string' && isValidDate(value)
    case 'yesNo':
      return typeof value === 'boolean'
    case 'choice':
      return (
        typeof value === 'string' &&
        (field.options ?? []).some(
          (option) =>
            option.id === value &&
            (allowArchived || option.archivedAt === undefined),
        )
      )
    case 'photo':
      return typeof value === 'string' && value.length > 0
  }
}

/** The text a value adds to its record's search keys. */
export function fieldSearchText(field: FieldShape, value: FieldValue): string {
  switch (field.type) {
    case 'text':
    case 'longText':
      return typeof value === 'string' ? value : ''
    case 'number':
      return typeof value === 'number' ? String(value) : ''
    case 'choice':
      return field.options?.find((option) => option.id === value)?.name ?? ''
    case 'money':
    case 'date':
    case 'yesNo':
    case 'photo':
      return ''
  }
}
