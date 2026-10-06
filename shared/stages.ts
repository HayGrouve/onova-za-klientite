/** The four fixed buckets every stage belongs to. Lists and money read these, never stage names. */
export const STAGE_GROUPS = ['new', 'in_progress', 'done', 'cancelled'] as const

export type StageGroup = (typeof STAGE_GROUPS)[number]

export const STAGE_COLORS = [
  'gray',
  'blue',
  'amber',
  'violet',
  'green',
  'red',
] as const

export type StageColor = (typeof STAGE_COLORS)[number]

export type StageDraft = { name: string; group: StageGroup; color: StageColor }

export type JobFlow = 'single' | 'multi'

/** Starting stages for a job flow (setup step 3). New, In progress and Done always get one each. */
export function stagesFor(flow: JobFlow): StageDraft[] {
  if (flow === 'single') {
    return [
      { name: 'Насрочено', group: 'new', color: 'blue' },
      { name: 'В работа', group: 'in_progress', color: 'amber' },
      { name: 'Готово', group: 'done', color: 'green' },
      { name: 'Отказано', group: 'cancelled', color: 'gray' },
    ]
  }
  return [
    { name: 'Запитване', group: 'new', color: 'blue' },
    { name: 'Оглед', group: 'in_progress', color: 'violet' },
    { name: 'В работа', group: 'in_progress', color: 'amber' },
    { name: 'Готово', group: 'done', color: 'green' },
    { name: 'Отказано', group: 'cancelled', color: 'gray' },
  ]
}
