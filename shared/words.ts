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
