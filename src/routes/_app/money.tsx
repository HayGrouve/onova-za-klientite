import { WalletIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageTitle } from '#/components/page'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/money')({ component: MoneyPage })

function MoneyPage() {
  return (
    <>
      <PageTitle>{m.money_title()}</PageTitle>
      <EmptyState
        icon={WalletIcon}
        title={m.money_empty_title()}
        body={m.money_empty_body()}
      />
    </>
  )
}
