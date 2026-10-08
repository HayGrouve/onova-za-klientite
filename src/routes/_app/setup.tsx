import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { CenteredMessage } from '#/components/centered-message'
import { SetupWizard } from '#/components/setup/setup-wizard'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { answersFromBusiness } from '../../../shared/setup'

export const Route = createFileRoute('/_app/setup')({ component: SetupPage })

function SetupPage() {
  const { business } = useViewer()
  const data = useQuery(api.setup.current, { businessId: business._id })
  if (!data) {
    return (
      <CenteredMessage>
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">{m.loading()}</span>
      </CenteredMessage>
    )
  }
  // Run again: start from the business as it is now, with every edit made in
  // Settings since, so confirming without changes changes nothing.
  const initialAnswers = data.current.setupDone
    ? answersFromBusiness(data.current)
    : {}
  return (
    <SetupWizard
      // A switch to another business starts over.
      key={business._id}
      businessId={business._id}
      current={data.current}
      initialAnswers={initialAnswers}
    />
  )
}
