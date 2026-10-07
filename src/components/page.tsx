import type { Icon } from '@phosphor-icons/react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'

export function PageTitle({ children }: { children: React.ReactNode }) {
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
