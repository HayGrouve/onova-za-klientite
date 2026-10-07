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
import { useSubmit } from '#/components/money/use-submit'
import { Panel, PanelBody, PanelList } from '#/components/panel'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { RemindersPanel } from '#/components/reminders/reminders-panel'
import { Tip } from '#/components/tip'
import { ListSkeleton } from '#/components/list-skeleton'
import { Timeline } from '#/components/timeline'
import { Button, buttonVariants } from '#/components/ui/button'
import { InputGroup, InputGroupInput } from '#/components/ui/input-group'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDayWithYear } from '#/i18n/dates'
import { m } from '#/paraglide/messages.js'
import { dateInSofia } from '../../../shared/dates'
import { searchClients } from '../../../shared/search'

export const Route = createFileRoute('/_app/items/$itemId')({
  staticData: { layout: 'wide' },
  component: ItemPage,
})

function ItemPage() {
  const { business } = useViewer()
  const { itemId } = Route.useParams()
  const today = useToday()
  const data = useQuery(api.items.get, {
    businessId: business._id,
    itemId: itemId as Id<'items'>,
  })
  const [panel, setPanel] = useState<'edit' | 'move' | 'reminder' | null>(null)
  const reminders = useQuery(
    api.reminders.forItem,
    business.modules.reminders
      ? { businessId: business._id, itemId: itemId as Id<'items'> }
      : 'skip',
  )
  if (!data) return <ListSkeleton />
  const { item, client } = data
  // "When did I last do this one?": the latest job that reached Done.
  const lastDoneAt = data.jobs.reduce<number | undefined>(
    (latest, job) =>
      job.stageGroup === 'done' &&
      job.doneAt !== undefined &&
      (latest === undefined || job.doneAt > latest)
        ? job.doneAt
        : latest,
    undefined,
  )

  return (
    // A wide screen puts the owner and fields on the left, the work and files
    // on the right. The phone keeps one column in the same order.
    <div className="flex flex-col gap-4 pb-6 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <header className="flex flex-col gap-2 px-4 pt-2 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {item.name}
          </h1>
          <Tip label={m.edit()}>
            <Button
              variant="ghost"
              size="icon-xl"
              aria-label={m.edit()}
              onClick={() => setPanel('edit')}
            >
              <PencilSimpleIcon />
            </Button>
          </Tip>
        </div>
        {lastDoneAt !== undefined && (
          <p className="text-sm text-muted-foreground">
            {m.item_last_done({
              date: formatDayWithYear(dateInSofia(lastDoneAt), today),
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
            <div className="flex animate-rise items-center gap-3 surface py-2 pr-2 pl-4">
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
              <Button
                variant="outline"
                className="h-11 shadow-xs"
                onClick={() => setPanel('move')}
              >
                <ArrowsLeftRightIcon data-icon="inline-start" />
                {m.item_move()}
              </Button>
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
            {data.jobs.map((job) => (
              <JobRow
                key={job._id}
                job={job}
                today={today}
                showClient={false}
                showDone
              />
            ))}
          </PanelList>
        </Panel>

        {business.modules.reminders && (
          <RemindersPanel
            reminders={reminders ?? []}
            today={today}
            onAdd={() => setPanel('reminder')}
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
      </div>

      <Sheet
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
        >
          <SheetHeader>
            <SheetTitle>
              {panel === 'move'
                ? m.item_move_title()
                : panel === 'reminder'
                  ? m.reminder_add_title()
                  : item.name}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {panel === 'edit' && (
              <ItemForm
                businessId={business._id}
                clientId={item.clientId}
                item={item}
                fields={data.fields}
                onSaved={() => setPanel(null)}
              />
            )}
            {panel === 'move' && (
              <MovePicker
                businessId={business._id}
                itemId={item._id}
                currentClientId={item.clientId}
                onDone={() => setPanel(null)}
              />
            )}
            {panel === 'reminder' && (
              <ReminderForm
                businessId={business._id}
                target={{ itemId: item._id }}
                initialDate={today}
                onDone={() => setPanel(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MovePicker({
  businessId,
  itemId,
  currentClientId,
  onDone,
}: {
  businessId: Id<'businesses'>
  itemId: Id<'items'>
  currentClientId: Id<'clients'>
  onDone: () => void
}) {
  const clients = useQuery(api.clients.list, { businessId })
  const move = useMutation(api.items.move)
  const { busy, run } = useSubmit(onDone)
  const [query, setQuery] = useState('')
  const [toId, setToId] = useState<Id<'clients'> | null>(null)
  if (!clients) return <ListSkeleton />
  const candidates = clients
    .filter((client) => !client.isNoClient && client._id !== currentClientId)
    .map((client) => ({
      ...client,
      id: client._id,
      phones: client.phone ? [client.phone] : [],
    }))
  const shown = query.trim()
    ? searchClients(candidates, query, 20)
    : candidates.slice(0, 20)
  // Only a client in view can be moved to: what is chosen is what is seen.
  const chosen = shown.find((client) => client._id === toId)
  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupInput
          autoFocus
          aria-label={m.clients_search()}
          placeholder={m.clients_search()}
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
      <Button
        size="xl"
        disabled={busy || !chosen}
        onClick={() =>
          chosen &&
          void run(
            () => move({ businessId, itemId, toClientId: chosen._id }),
            m.item_moved(),
          )
        }
      >
        {busy && <Spinner data-icon="inline-start" />}
        {m.item_move_confirm()}
      </Button>
    </div>
  )
}
