import {
  ClipboardTextIcon,
  KanbanIcon,
  MagnifyingGlassIcon,
  TableIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { JobsBoard } from '#/components/jobs/jobs-board'
import { JobsTable } from '#/components/jobs/jobs-table'
import { JobRow } from '#/components/job-row'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { EmptyState, PageTitle } from '#/components/page'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { GROUP_LABEL } from '#/i18n/groups'
import { m } from '#/paraglide/messages.js'
import { STAGE_GROUPS } from '../../../shared/stages'
import type { StageGroup } from '../../../shared/stages'

type JobsSearch = { group?: StageGroup; view?: 'table' }

export const Route = createFileRoute('/_app/jobs/')({
  validateSearch: (search: Record<string, unknown>): JobsSearch => ({
    ...(STAGE_GROUPS.includes(search.group as StageGroup) && {
      group: search.group as StageGroup,
    }),
    ...(search.view === 'table' && { view: 'table' as const }),
  }),
  staticData: { layout: 'full' },
  component: JobsPage,
})

function JobsPage() {
  const wide = useWide()
  return wide ? <WideJobsPage /> : <JobsList />
}

/**
 * A wide screen: the board by default, or one group as a sortable table
 * (`view=table`), with a filter for the board.
 */
function WideJobsPage() {
  const { words } = useViewer().business
  const view = Route.useSearch({ select: (search) => search.view ?? 'board' })
  const today = useToday()
  const [filter, setFilter] = useState('')

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 pr-4">
        <PageTitle>{words.job.plural}</PageTitle>
        <nav
          aria-label={m.jobs_view()}
          className="mb-1 flex h-10 items-center rounded-full bg-foreground/6 p-1"
        >
          <ViewLink
            view="board"
            icon={KanbanIcon}
            label={m.jobs_view_board()}
          />
          <ViewLink view="table" icon={TableIcon} label={m.jobs_view_table()} />
        </nav>
        {view === 'board' && (
          <InputGroup className="mb-1 ml-auto h-10 w-72 bg-card">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={m.jobs_filter()}
              placeholder={m.jobs_filter()}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </InputGroup>
        )}
      </div>
      {view === 'board' ? (
        <JobsBoard filter={filter} today={today} />
      ) : (
        <JobsList table />
      )}
    </>
  )
}

function ViewLink({
  view,
  icon: IconComponent,
  label,
}: {
  view: 'board' | 'table'
  icon: Icon
  label: string
}) {
  return (
    <Link
      from={Route.fullPath}
      to="."
      search={(search) => ({
        ...search,
        view: view === 'table' ? 'table' : undefined,
      })}
      replace
      activeOptions={{ includeSearch: true, explicitUndefined: true }}
      className="flex h-full items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-background data-[status=active]:text-foreground data-[status=active]:shadow-sm"
    >
      <IconComponent aria-hidden className="size-4" />
      {label}
    </Link>
  )
}

/** One stage group at a time, picked by tabs: a list on the phone, a table on a wide screen. */
function JobsList({ table = false }: { table?: boolean }) {
  const { business } = useViewer()
  const group = Route.useSearch({ select: (search) => search.group ?? 'new' })
  const navigate = useNavigate({ from: Route.fullPath })
  const today = useToday()
  const data = useQuery(api.jobs.list, { businessId: business._id, group })
  // The counts don't depend on the open tab, so they stay while another loads.
  const counts = useLatest(data?.counts)
  const { words } = business

  return (
    <>
      {!table && <PageTitle>{words.job.plural}</PageTitle>}
      <Tabs
        value={group}
        onValueChange={(value) =>
          void navigate({
            search: (search) => ({ ...search, group: value as StageGroup }),
            replace: true,
          })
        }
        className="px-4 pb-3"
      >
        <TabsList className="w-full rounded-full bg-foreground/6 group-data-horizontal/tabs:h-11 lg:w-auto lg:min-w-120">
          {STAGE_GROUPS.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="h-full gap-1 rounded-full px-1 text-[0.8125rem]"
            >
              {GROUP_LABEL[key]()}
              {counts && counts[key] > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {counts[key]}
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
      ) : table ? (
        <JobsTable jobs={data.jobs} today={today} />
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

/** The value, or the last one that wasn't undefined while it reloads. */
function useLatest<T>(value: T | undefined) {
  const [latest, setLatest] = useState(value)
  if (value !== undefined && value !== latest) setLatest(value)
  return value ?? latest
}
