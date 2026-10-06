import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { FieldsSettings } from '#/components/settings/fields-settings'
import { PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

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
  return (
    <>
      <Link
        to="/settings"
        className="flex min-h-11 w-fit items-center gap-1 px-3 pt-2 text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CaretLeftIcon className="size-5" />
        {m.settings_title()}
      </Link>
      <PageTitle>{m.fields_settings_title()}</PageTitle>
      <FieldsSettings businessId={business._id} initialTarget={target} />
    </>
  )
}
