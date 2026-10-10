import type { Icon } from '@phosphor-icons/react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { usePageTitle } from '#/hooks/use-page-title'

/** The page's heading, which also names the browser tab. */
export function PageTitle({ children }: { children: string }) {
  usePageTitle(children)
  return (
    <h1 className="px-4 pt-1 pb-3 text-[1.75rem] leading-tight font-semibold tracking-[-0.012em] text-balance break-words">
      {children}
    </h1>
  )
}

export function EmptyState({
  icon: IconComponent,
  title,
  body,
  action,
}: {
  icon: Icon
  title: string
  body: string
  /** The first step to take, when there's an obvious one. */
  action?: React.ReactNode
}) {
  return (
    <Empty className="px-8">
      <EmptyHeader>
        <EmptyMedia className="size-16 rounded-3xl bg-accent text-primary">
          <IconComponent className="size-8" weight="duotone" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
