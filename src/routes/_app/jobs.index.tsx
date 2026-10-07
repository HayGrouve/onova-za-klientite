import { ClipboardTextIcon } from '@phosphor-icons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { JobRow } from '#/components/job-row'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { EmptyState, PageTitle } from '#/components/page'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { GROUP_LABEL } from '#/i18n/groups'
import { m } from '#/paraglide/messages.js'
import { STAGE_GROUPS } from '../../../shared/stages'
import type { StageGroup } from '../../../shared/stages'

export const Route = createFileRoute('/_app/jobs/')({
  validateSearch: (search: Record<string, unknown>): { group?: StageGroup } =>
    STAGE_GROUPS.includes(search.group as StageGroup)
      ? { group: search.group as StageGroup }
      : {},
  component: JobsPage,
})

function JobsPage() {
  const { business } = useViewer()
  const group = Route.useSearch({ select: (search) => search.group ?? 'new' })
  const navigate = useNavigate({ from: Route.fullPath })
  const today = useToday()
  const data = useQuery(api.jobs.list, { businessId: business._id, group })
  const { words } = business

  return (
    <>
      <PageTitle>{words.job.plural}</PageTitle>
      <Tabs
        value={group}
        onValueChange={(value) =>
          void navigate({
            search: { group: value as StageGroup },
            replace: true,
          })
        }
        className="px-4 pb-3"
      >
        <TabsList className="w-full rounded-full bg-foreground/6 group-data-horizontal/tabs:h-11">
          {STAGE_GROUPS.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="h-full gap-1 rounded-full px-1 text-[0.8125rem]"
            >
              {GROUP_LABEL[key]()}
              {data && data.counts[key] > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {data.counts[key]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!data ? (
        <ListSkeleton />
      ) : data.jobs.length === 0 ? (
        <EmptyState
          icon={ClipboardTextIcon}
          title={GROUP_LABEL[group]()}
          body={m.jobs_group_empty()}
        />
      ) : (
        <>
          <p className="px-4 pb-1 text-sm text-muted-foreground">
            {m.count({ label: words.job.plural, count: data.jobs.length })}
          </p>
          <ListCard>
            {data.jobs.map((job) => (
              <JobRow key={job._id} job={job} today={today} />
            ))}
          </ListCard>
        </>
      )}
    </>
  )
}
