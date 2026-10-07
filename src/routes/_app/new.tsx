import { PlusIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/new')({ component: NewJobPage })

function NewJobPage() {
  const { words } = useViewer().business
  return (
    <>
      <PageTitle>{m.new_job({ job: words.job.singular })}</PageTitle>
      <EmptyState
        icon={PlusIcon}
        title={m.new_job_title()}
        body={m.new_job_soon()}
      />
    </>
  )
}
