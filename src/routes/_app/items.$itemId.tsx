import {
  ArrowsLeftRightIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  PaperclipIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { ItemForm } from '#/components/item-form'
import { JobRow } from '#/components/job-row'
import { ConfirmQuestion } from '#/components/confirm-action'
import { useSubmit } from '#/components/money/use-submit'
import { Panel, PanelBody, PanelList } from '#/components/panel'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { RemindersPanel } from '#/components/reminders/reminders-panel'
import { Tip } from '#/components/tip'
import { ListNote } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { MoreSection } from '#/components/more-section'
import { DetailError } from '#/components/not-found'
import { Timeline } from '#/components/timeline'
import { Button, buttonVariants } from '#/components/ui/button'
import { InputGroup, InputGroupInput } from '#/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { DetailSheet, useDetailSheet } from '#/components/detail-sheet'
import { usePageTitle } from '#/hooks/use-page-title'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { dateInSofia } from '../../../shared/dates'
import { asCandidate, searchClients } from '../../../shared/search'
import { lastDoneAt } from '../../../shared/stages'

export const Route = createFileRoute('/_app/items/$itemId')({
  staticData: { layout: 'wide' },
  component: ItemPage,
  // A wrong address, or a record from another business, says so (D16).
  errorComponent: ({ error }) => <DetailError error={error} kind="item" />,
})

function ItemPage() {
  const { business } = useViewer()
  const { itemId } = Route.useParams()
  const today = useToday()
  const data = useQuery(api.items.get, {
    businessId: business._id,
    itemId,
  })
  usePageTitle(data?.item.name)
  const sheet = useDetailSheet<{ kind: 'edit' | 'move' | 'reminder' }>()
  if (!data) return <ListSkeleton />
  const { item, client } = data
  // "When did I last do this one?": the latest job that reached Done.
  const lastDone = lastDoneAt(data.jobs)
  // The folded parts, by name, with how many each holds.
  const counted = (title: string, count: number) =>
    count > 0 ? `${title}: ${count}` : title
  const moreSummary = [
    ...(business.modules.reminders
      ? [counted(m.reminder_list(), data.reminders.length)]
      : []),
    m.job_files(),
    ...(data.timeline.length > 0
      ? [counted(m.item_history(), data.timeline.length)]
      : []),
    ...(client ? [m.item_move()] : []),
  ]

  return (
    // A wide screen puts the owner and fields on the left, the work and files
    // on the right. The phone keeps one column in the same order.
    <div className="flex flex-col gap-4 pb-6 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <header className="flex flex-col gap-2 px-4 pt-2 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-2xl leading-tight font-semibold tracking-tight text-balance break-words">
            {item.name}
          </h1>
          <Tip label={m.edit()}>
            <Button
              variant="ghost"
              size="icon-xl"
              aria-label={m.edit()}
              onClick={() => sheet.open({ kind: 'edit' })}
            >
              <PencilSimpleIcon />
            </Button>
          </Tip>
        </div>
        {lastDone !== undefined && (
          <p className="text-sm text-muted-foreground">
            {m.item_last_done({
              date: formatDay(dateInSofia(lastDone), today),
            })}
          </p>
        )}
        {/* The job starts for this item's client with the item linked. */}
        <Link
          to="/new"
          search={{ clientId: item.clientId, itemId: item._id }}
          className={buttonVariants({
            size: 'xl',
            className: 'w-full lg:w-fit',
          })}
        >
          {m.new_job({ job: business.words.job.singular })}
        </Link>
      </header>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <div className="px-4 empty:hidden">
          {client && (
            <div className="flex animate-rise items-center gap-3 surface px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-muted-foreground">
                  {m.item_owner()}
                </span>
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: client._id }}
                  className="truncate font-medium text-primary underline-offset-4 hover:underline"
                >
                  {client.name}
                </Link>
              </span>
            </div>
          )}
        </div>
        <div className="empty:hidden">
          <ExtraFieldsView
            fields={data.fields}
            values={item.extra}
            today={today}
          />
        </div>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <Panel
          title={business.words.job.plural}
          icon={ClipboardTextIcon}
          count={data.jobs.length || undefined}
        >
          <PanelList>
            {data.jobs.length === 0 ? (
              <ListNote>{m.client_no_jobs()}</ListNote>
            ) : (
              data.jobs.map((job) => (
                <JobRow
                  key={job._id}
                  job={job}
                  today={today}
                  showClient={false}
                  showDone
                />
              ))
            )}
          </PanelList>
        </Panel>

        <MoreSection page="item" summary={moreSummary}>
          {business.modules.reminders && (
            <RemindersPanel
              reminders={data.reminders}
              on="item"
              today={today}
              onAdd={() => sheet.open({ kind: 'reminder' })}
            />
          )}

          <Panel title={m.job_files()} icon={PaperclipIcon}>
            <PanelBody className="px-0">
              <FileGallery
                businessId={business._id}
                target={{ kind: 'item', itemId: item._id }}
              />
            </PanelBody>
          </Panel>

          {data.timeline.length > 0 && (
            <Panel title={m.item_history()} icon={ClockCounterClockwiseIcon}>
              <PanelBody className="px-0">
                <Timeline items={data.timeline} />
              </PanelBody>
            </Panel>
          )}
          {client && (
            <Button
              variant="outline"
              size="xl"
              className="mx-4"
              onClick={() => sheet.open({ kind: 'move' })}
            >
              <ArrowsLeftRightIcon data-icon="inline-start" />
              {m.item_move()}
            </Button>
          )}
        </MoreSection>
      </div>

      <DetailSheet
        sheet={sheet}
        title={
          sheet.panel?.kind === 'move'
            ? m.item_move_title()
            : sheet.panel?.kind === 'reminder'
              ? m.reminder_add_title()
              : item.name
        }
      >
        {sheet.panel?.kind === 'edit' && (
          <ItemForm
            businessId={business._id}
            clientId={item.clientId}
            item={item}
            fields={data.fields}
            onSaved={sheet.close}
            onDirtyChange={sheet.setDirty}
          />
        )}
        {sheet.panel?.kind === 'move' && (
          <MovePicker
            businessId={business._id}
            itemId={item._id}
            itemName={item.name}
            from={client}
            jobsWord={
              data.jobs.length > 0 ? business.words.job.plural : undefined
            }
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'reminder' && (
          <ReminderForm
            businessId={business._id}
            target={{ itemId: item._id }}
            initialDate={today}
            onDone={sheet.close}
          />
        )}
      </DetailSheet>
    </div>
  )
}

function MovePicker({
  businessId,
  itemId,
  itemName,
  from,
  jobsWord,
  onDone,
}: {
  businessId: Id<'businesses'>
  itemId: Id<'items'>
  itemName: string
  /** The client it is with now. */
  from: { _id: Id<'clients'>; name: string } | null
  /** The plural word for its jobs, when it has any: they are not touched. */
  jobsWord?: string
  onDone: () => void
}) {
  const clients = useQuery(api.clients.list, { businessId })
  const move = useMutation(api.items.move)
  const { busy, run } = useSubmit(onDone)
  const [query, setQuery] = useState('')
  const [toId, setToId] = useState<Id<'clients'> | null>(null)
  // The client the question is about: picking another one drops it.
  const [askingFor, setAskingFor] = useState<Id<'clients'> | null>(null)
  if (!clients) return <ListSkeleton />
  const candidates = clients
    .filter((client) => !client.isNoClient && client._id !== from?._id)
    .map(asCandidate)
  const shown = query.trim()
    ? searchClients(candidates, query, 20)
    : candidates.slice(0, 20)
  // Only a client in view can be moved to: what is chosen is what is seen.
  const chosen = shown.find((client) => client._id === toId)
  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupInput
          name="search"
          type="search"
          spellCheck={false}
          aria-label={m.clients_search()}
          placeholder={m.clients_search_placeholder()}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      <ToggleGroup
        aria-label={m.item_move_title()}
        value={toId ? [toId] : []}
        onValueChange={(next: string[]) => {
          // Tapping the chosen one again keeps it chosen.
          if (next[0]) setToId(next[0] as Id<'clients'>)
        }}
        variant="outline"
        size="xl"
        orientation="vertical"
        className="w-full"
      >
        {shown.map((client) => (
          <ToggleGroupItem
            key={client._id}
            value={client._id}
            className="justify-start"
          >
            {client.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {chosen && askingFor === chosen._id ? (
        <ConfirmQuestion
          tone="default"
          question={
            jobsWord
              ? m.item_move_question_jobs({
                  name: itemName,
                  from: from?.name ?? '',
                  to: chosen.name,
                  jobs: jobsWord,
                })
              : m.item_move_question({
                  name: itemName,
                  from: from?.name ?? '',
                  to: chosen.name,
                })
          }
          confirmLabel={m.item_move_confirm()}
          cancelLabel={m.back()}
          busy={busy}
          onConfirm={() =>
            void run(
              () => move({ businessId, itemId, toClientId: chosen._id }),
              m.item_moved(),
            )
          }
          onCancel={() => setAskingFor(null)}
        />
      ) : (
        <Button size="xl" disabled={!chosen} onClick={() => setAskingFor(toId)}>
          {m.item_move_confirm()}
        </Button>
      )}
    </div>
  )
}
