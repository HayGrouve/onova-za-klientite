import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { CenteredMessage } from '#/components/centered-message'
import { NewJobForm } from '#/components/new-job/new-job-form'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/new')({ component: NewJobPage })

function NewJobPage() {
  const { business } = useViewer()
  const context = useQuery(api.newJob.context, { businessId: business._id })
  if (!context) {
    return (
      <CenteredMessage>
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">{m.loading()}</span>
      </CenteredMessage>
    )
  }
  return (
    <NewJobForm
      key={business._id}
      business={business}
      clients={context.clients}
      services={context.services}
    />
  )
}
