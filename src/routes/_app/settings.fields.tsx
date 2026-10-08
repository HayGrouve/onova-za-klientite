import { createFileRoute } from '@tanstack/react-router'
import { FieldsSettings } from '#/components/settings/fields-settings'
import { useViewer } from '#/hooks/use-viewer'

type Target = 'client' | 'job' | 'item'

export const Route = createFileRoute('/_app/settings/fields')({
  validateSearch: (search: Record<string, unknown>): { target?: Target } =>
    search.target === 'client' ||
    search.target === 'job' ||
    search.target === 'item'
      ? { target: search.target }
      : {},
  component: FieldsPage,
})

function FieldsPage() {
  const { business } = useViewer()
  const { target } = Route.useSearch()
  return <FieldsSettings businessId={business._id} initialTarget={target} />
}
