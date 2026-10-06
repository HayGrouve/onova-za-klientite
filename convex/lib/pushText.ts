// ALLOWLIST: this is the only file in convex/ that holds Bulgarian text. The
// server sends push notifications itself, so their words can't come from the
// client's Paraglide messages (D16). Everything else in convex/ returns codes.
//
// Grammar rule (AGENTS.md): no number before a renamable noun and no gendered
// adjective. The business's own word comes first: "Срещи: 2 · Закъснели: 1".

const TITLE = 'Днес'
const OVERDUE_LABEL = 'Закъснели'
const REMINDERS_LABEL = 'Напомняния'
const SEPARATOR = ' · '

export type SummaryCounts = {
  appointments: number
  overdue: number
  reminders: number
}

/** "Днес · Мебели Стоянов": the business name tells two businesses apart. */
export function summaryTitle(businessName: string): string {
  const name = businessName.trim()
  return name ? `${TITLE}${SEPARATOR}${name}` : TITLE
}

/** Only the sections that have something in them. `appointmentsWord` is the plural. */
export function summaryBody(
  counts: SummaryCounts,
  appointmentsWord: string,
): string {
  const parts: string[] = []
  if (counts.appointments > 0) {
    parts.push(`${appointmentsWord}: ${counts.appointments}`)
  }
  if (counts.overdue > 0) parts.push(`${OVERDUE_LABEL}: ${counts.overdue}`)
  if (counts.reminders > 0) {
    parts.push(`${REMINDERS_LABEL}: ${counts.reminders}`)
  }
  return parts.join(SEPARATOR)
}
