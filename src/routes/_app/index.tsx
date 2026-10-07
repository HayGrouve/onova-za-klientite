import { SunIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageTitle } from '#/components/page'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/')({ component: TodayPage })

function TodayPage() {
  return (
    <>
      <PageTitle>{m.today_title()}</PageTitle>
      <EmptyState
        icon={SunIcon}
        title={m.today_empty_title()}
        body={m.today_empty_body()}
      />
    </>
  )
}
