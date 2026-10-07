import type { Icon } from '@phosphor-icons/react'
import {
  Empty,
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
    <h1 className="px-4 pt-2 pb-3 text-3xl font-semibold tracking-tight">
      {children}
    </h1>
  )
}

export function EmptyState({
  icon: IconComponent,
  title,
  body,
}: {
  icon: Icon
  title: string
  body: string
}) {
  return (
    <Empty className="animate-rise px-8">
      <EmptyHeader>
        <EmptyMedia className="size-16 rounded-3xl bg-primary/10 text-primary">
          <IconComponent className="size-8" weight="duotone" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
