import { ArrowsClockwiseIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { PageTitle } from '#/components/page'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

// Milestone 7 fills in the sections. Setup can already run again from here.
function SettingsPage() {
  return (
    <>
      <PageTitle>{m.settings_title()}</PageTitle>
      <div className="flex flex-col gap-3 px-4">
        <Link
          to="/setup"
          className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowsClockwiseIcon className="size-6 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{m.settings_run_setup()}</span>
            <span className="text-sm text-muted-foreground">
              {m.settings_run_setup_body()}
            </span>
          </span>
          <CaretRightIcon className="size-5 shrink-0 text-muted-foreground" />
        </Link>
        <p className="px-1 text-sm text-muted-foreground">
          {m.settings_more_soon()}
        </p>
      </div>
    </>
  )
}
