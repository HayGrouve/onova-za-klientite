import { ClipboardTextIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/jobs')({ component: JobsPage })

function JobsPage() {
  const { words } = useViewer().business
  return (
    <>
      <PageTitle>{words.job.plural}</PageTitle>
      <EmptyState
        icon={ClipboardTextIcon}
        title={m.jobs_empty_title({ jobs: words.job.plural })}
        body={m.jobs_empty_body()}
      />
    </>
  )
}
