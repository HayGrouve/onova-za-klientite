/** A renamable noun: what a business calls its clients, jobs, items, appointments. */
export type Gender = 'm' | 'f' | 'n'

export type Word = { singular: string; plural: string; gender: Gender }

export type Words = {
  client: Word
  job: Word
  item: Word
  appointment: Word
}

/** The words a new business starts with (CONTEXT.md, D5). */
export const DEFAULT_WORDS: Words = {
  client: { singular: 'Клиент', plural: 'Клиенти', gender: 'm' },
  job: { singular: 'Поръчка', plural: 'Поръчки', gender: 'f' },
  item: { singular: 'Обект', plural: 'Обекти', gender: 'm' },
  appointment: { singular: 'Среща', plural: 'Срещи', gender: 'f' },
}

/** A best guess, always shown for editing. "Урок" → "Уроци", "Сеанс" → "Сеанси". */
export function guessPlural(singular: string): string {
  const word = singular.trim()
  if (!word) return ''
  if (/ие$/i.test(word)) return word.slice(0, -1) + 'я'
  // Verbal nouns: почистване → почиствания. Other neuters: куче → кучета.
  if (/не$/i.test(word)) return word.slice(0, -1) + 'ия'
  if (/е$/i.test(word)) return word + 'та'
  if (/ия$/i.test(word)) return word.slice(0, -1) + 'и'
  if (/[ая]$/i.test(word)) return word.slice(0, -1) + 'и'
  if (/о$/i.test(word)) return word.slice(0, -1) + 'а'
  if (/к$/i.test(word)) return word.slice(0, -1) + 'ци'
  if (/г$/i.test(word)) return word.slice(0, -1) + 'зи'
  if (/х$/i.test(word)) return word.slice(0, -1) + 'си'
  return word + 'и'
}

export const MAX_WORD_LENGTH = 40

export function isValidWord(word: Word): boolean {
  const ok = (text: string) => {
    const trimmed = text.trim()
    return trimmed.length > 0 && trimmed.length <= MAX_WORD_LENGTH
  }
  return ok(word.singular) && ok(word.plural)
}

/** A best guess at a Bulgarian noun's gender from its ending, editable in Settings. */
export function guessGender(singular: string): Gender {
  const word = singular.trim().toLocaleLowerCase('bg')
  if (/[ая]$/.test(word)) return 'f'
  if (/[оеиую]$/.test(word)) return 'n'
  return 'm'
}
