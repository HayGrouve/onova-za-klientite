import { UsersIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/clients')({
  component: ClientsPage,
})

function ClientsPage() {
  const { words } = useViewer().business
  return (
    <>
      <PageTitle>{words.client.plural}</PageTitle>
      <EmptyState
        icon={UsersIcon}
        title={m.clients_empty_title({ clients: words.client.plural })}
        body={m.clients_empty_body()}
      />
    </>
  )
}
