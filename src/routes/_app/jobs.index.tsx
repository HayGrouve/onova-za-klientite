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
import { FilterChips } from '#/components/jobs/filter-chips'
import { JobsBoard } from '#/components/jobs/jobs-board'
import { JOB_SORT_KEYS, JobsTable } from '#/components/jobs/jobs-table'
import type { JobSortKey } from '#/components/jobs/jobs-table'
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
import { useNow } from '#/hooks/use-now'
import { useToday } from '#/hooks/use-today'
import { useUrlText } from '#/hooks/use-url-text'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { GROUP_LABEL } from '#/i18n/groups'
import { m } from '#/paraglide/messages.js'
import {
  filterFromSearch,
  filterJobs,
  isFiltering,
  parseFilterSearch,
} from '../../../shared/board'
import type { JobFilter, JobFilterSearch } from '../../../shared/board'
import {
  nextSort,
  parseSortSearch,
  sortFromSearch,
  sortToSearch,
} from '../../../shared/sort'
import type { SortSearch } from '../../../shared/sort'
import { STAGE_GROUPS } from '../../../shared/stages'
import type { StageGroup } from '../../../shared/stages'

/**
 * The list's state lives in the address (view, tab, sort, filter), so Back
 * from a job returns to the same list. The table's tabs also have "all".
 */
type JobsSearch = {
  group?: StageGroup | 'all'
  view?: 'table'
} & JobFilterSearch &
  SortSearch<JobSortKey>

export const Route = createFileRoute('/_app/jobs/')({
  validateSearch: (search: Record<string, unknown>): JobsSearch => ({
    ...(search.group === 'all' ||
    STAGE_GROUPS.includes(search.group as StageGroup)
      ? { group: search.group as StageGroup | 'all' }
      : {}),
    ...(search.view === 'table' && { view: 'table' as const }),
    ...parseFilterSearch(search),
    ...parseSortSearch(search, JOB_SORT_KEYS),
  }),
  staticData: { layout: 'full' },
  component: JobsPage,
})

/** Changes the list's state in the address, in place: Back leaves the list, not the last click. */
function useListSearch() {
  const navigate = useNavigate({ from: Route.fullPath })
  return (patch: Partial<JobsSearch>) =>
    void navigate({
      search: (search) => ({ ...search, ...patch }),
      replace: true,
    })
}

function JobsPage() {
  const wide = useWide()
  return wide ? <WideJobsPage /> : <JobsList />
}

/**
 * A wide screen: the board by default, or the jobs as a sortable table
 * (`view=table`), with one filter for both: words, and two chips.
 */
function WideJobsPage() {
  const { words } = useViewer().business
  const search = Route.useSearch()
  const view = search.view ?? 'board'
  const today = useToday()
  const setSearch = useListSearch()
  const filter = filterFromSearch(search)
  const filterText = useUrlText(search.q ?? '', (value) =>
    setSearch({ q: value.trim() ? value : undefined }),
  )
  const chips = (
    <FilterChips
      owing={search.owing === true}
      dueThisMonth={search.due === 'month'}
      onOwing={(on) => setSearch({ owing: on ? true : undefined })}
      onDueThisMonth={(on) => setSearch({ due: on ? 'month' : undefined })}
    />
  )

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
        <InputGroup className="mb-1 ml-auto h-10 w-80 bg-card">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            name="jobs-filter"
            spellCheck={false}
            aria-label={m.jobs_filter()}
            placeholder={m.jobs_filter_placeholder()}
            {...filterText}
          />
        </InputGroup>
      </div>
      {view === 'board' ? (
        <>
          <div className="px-4 pb-3">{chips}</div>
          <JobsBoard filter={filter} today={today} />
        </>
      ) : (
        <JobsList table filter={filter} toolbar={chips} />
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

const NO_FILTER: JobFilter = {}

/**
 * One stage group at a time, picked by tabs: a list on the phone, a table on
 * a wide screen, where "all" is one more tab and the filter applies.
 */
function JobsList({
  table = false,
  filter = NO_FILTER,
  toolbar,
}: {
  table?: boolean
  filter?: JobFilter
  /** Beside the tabs on a wide screen: the filter chips. */
  toolbar?: React.ReactNode
}) {
  const { business } = useViewer()
  const search = Route.useSearch()
  // Only the table has "all"; the phone's four tabs fall back to New.
  const group =
    search.group === 'all' && !table ? 'new' : (search.group ?? 'new')
  const setSearch = useListSearch()
  const today = useToday()
  const now = useNow()
  // A filter counts what it finds in every tab, so it reads all of them.
  const filtering = table && isFiltering(filter)
  const data = useQuery(
    api.jobs.list,
    group === 'all' || filtering
      ? { businessId: business._id, now }
      : { businessId: business._id, group, now },
  )
  // The counts don't depend on the open tab, so they stay while another loads.
  const counts = useLatest(data?.counts)
  const { words } = business
  const sort = sortFromSearch(search)
  const found = data && filterJobs(data.jobs, filter, today)
  const jobs =
    found &&
    (group === 'all' ? found : found.filter((job) => job.stageGroup === group))
  // "2/6" in a tab while filtering, as the board's columns do.
  const shown = (key: StageGroup | 'all', total: number) => {
    if (!filtering || !found) return String(total)
    const hits =
      key === 'all'
        ? found.length
        : found.filter((job) => job.stageGroup === key).length
    return `${hits}/${total}`
  }

  return (
    <>
      {!table && <PageTitle>{words.job.plural}</PageTitle>}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
        <Tabs
          value={group}
          onValueChange={(value) => setSearch({ group: value as typeof group })}
          className="w-full gap-0 lg:w-auto"
        >
          <TabsList className="w-full rounded-full bg-foreground/6 group-data-horizontal/tabs:h-11 lg:w-auto lg:min-w-120 lg:self-start">
            {STAGE_GROUPS.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="h-full gap-1 rounded-full px-1 text-[0.8125rem]"
              >
                {GROUP_LABEL[key]()}
                {counts && counts[key] > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {shown(key, counts[key])}
                  </span>
                )}
              </TabsTrigger>
            ))}
            {table && (
              <TabsTrigger
                value="all"
                className="h-full gap-1 rounded-full px-3 text-[0.8125rem]"
              >
                {m.jobs_group_all()}
                {counts && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {shown(
                      'all',
                      counts.new +
                        counts.in_progress +
                        counts.done +
                        counts.cancelled,
                    )}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        {toolbar}
      </div>
      {/* Mounted empty, then filled: tells a screen reader what a filter found. */}
      <p role="status" className="sr-only">
        {filtering && jobs
          ? jobs.length === 0
            ? m.jobs_filter_none()
            : m.count({ label: words.job.plural, count: jobs.length })
          : ''}
      </p>
      {!jobs ? (
        <ListSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={ClipboardTextIcon}
          title={group === 'all' ? m.jobs_group_all() : GROUP_LABEL[group]()}
          body={
            data.jobs.length > 0 ? m.jobs_filter_none() : m.jobs_group_empty()
          }
        />
      ) : table ? (
        <JobsTable
          jobs={jobs}
          today={today}
          sort={sort}
          onSort={(key, numeric) =>
            setSearch(sortToSearch(nextSort(sort, key, numeric)))
          }
        />
      ) : (
        <>
          <p className="px-4 pb-1 text-sm text-muted-foreground">
            {m.count({ label: words.job.plural, count: jobs.length })}
          </p>
          <ListCard>
            {jobs.map((job) => (
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
