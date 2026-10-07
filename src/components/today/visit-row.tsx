import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'

export type VisitRowData = FunctionReturnType<
  typeof api.today.list
>['appointments'][number]

/** One appointment on Today: it leads with its own time and label, then the job. */
export function VisitRow({
  item,
  today,
}: {
  item: VisitRowData
  today: string
}) {
  if (!item.job) return null
  return (
    <JobRow
      job={item.job}
      today={today}
      lead={{
        kind: 'appointment',
        start: item.start,
        allDay: item.allDay,
        label: item.label,
      }}
    />
  )
}
