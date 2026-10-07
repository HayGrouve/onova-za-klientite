import { DownloadSimpleIcon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageTitle } from '#/components/page'
import { buttonVariants } from '#/components/ui/button'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/import')({ component: ImportPage })

// Setup step 8 lands here. Import itself is milestone 9.
function ImportPage() {
  return (
    <>
      <PageTitle>{m.import_title()}</PageTitle>
      <EmptyState
        icon={DownloadSimpleIcon}
        title={m.import_title()}
        body={m.import_soon()}
      />
      <div className="flex justify-center px-4">
        <Link to="/" className={buttonVariants({ size: 'xl' })}>
          {m.import_go_today()}
        </Link>
      </div>
    </>
  )
}
