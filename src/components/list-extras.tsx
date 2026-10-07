import { useQuery } from 'convex/react'
import { cn } from 'cn'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { formatFieldValue } from '#/components/extra-fields'
import type { ExtraValues } from '#/components/extra-fields'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'

/**
 * A list row's extra fields marked "show in list" (Settings → Полета), as
 * "Порода: Пудел · Номер: СА 1234 ВР". Nothing when none is filled in.
 */
export function ListExtras({
  target,
  values,
  className,
}: {
  target: Doc<'fields'>['target']
  values?: ExtraValues
  className?: string
}) {
  const { business } = useViewer()
  const today = useToday()
  // One subscription for every row of the same target.
  const fields = useQuery(
    api.fields.list,
    values ? { businessId: business._id, target } : 'skip',
  )
  if (!values || !fields) return null
  const parts = fields.flatMap((field) => {
    if (!field.showInList) return []
    const text = formatFieldValue(field, values[field._id], today)
    return text ? [`${field.name}: ${text}`] : []
  })
  if (parts.length === 0) return null
  return (
    <span
      className={cn('line-clamp-2 text-sm text-muted-foreground', className)}
    >
      {parts.join(' · ')}
    </span>
  )
}
