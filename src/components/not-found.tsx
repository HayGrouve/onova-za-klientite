import { ArrowLeftIcon, CompassIcon, SunIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ErrorView } from '#/components/error-view'
import { buttonVariants } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { useViewer } from '#/hooks/use-viewer'
import { isNotFound } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

const BACK_BUTTON = buttonVariants({ size: 'xl', className: 'rounded-xl' })

/** The text and the way back, in the app's style: the quiet icon, one action. */
function Missing({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: React.ReactNode
}) {
  return (
    <div className="flex min-h-[70dvh] flex-1 items-center justify-center">
      <Empty className="px-8">
        <EmptyHeader>
          <EmptyMedia className="size-16 rounded-3xl bg-primary/10 text-primary">
            <CompassIcon className="size-8" weight="duotone" />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={1} className="text-base">
            {title}
          </EmptyTitle>
          <EmptyDescription>{body}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{action}</EmptyContent>
      </Empty>
    </div>
  )
}

/**
 * An address that matches no page. It can stand outside the signed-in shell,
 * so it needs nothing from it: only a way to the first screen.
 */
export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <Missing
        title={m.not_found_title()}
        body={m.not_found_body()}
        action={
          <Link to="/" className={BACK_BUTTON}>
            <SunIcon data-icon="inline-start" />
            {m.not_found_home()}
          </Link>
        }
      />
    </main>
  )
}

type Kind = 'job' | 'client' | 'item'

// Where a missing record goes back to. An item belongs to a client, so the
// clients are where to look for it.
const BACK: Record<Kind, LinkProps['to']> = {
  job: '/jobs',
  client: '/clients',
  item: '/clients',
}

/**
 * The error screen of a job, client or item page: "not found" with a way back
 * to the list when the address is wrong or the record is someone else's (D16),
 * the general error screen for anything else. The list's own name is the way
 * back.
 */
export function DetailError({ error, kind }: { error: unknown; kind: Kind }) {
  const { words } = useViewer().business
  if (!isNotFound(error)) return <ErrorView error={error} />
  const list = kind === 'job' ? words.job : words.client
  return (
    <Missing
      title={m.record_not_found_title()}
      body={m.record_not_found_body()}
      action={
        <Link to={BACK[kind]} className={BACK_BUTTON}>
          <ArrowLeftIcon data-icon="inline-start" />
          {list.plural}
        </Link>
      }
    />
  )
}
