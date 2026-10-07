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
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { ItemForm } from '#/components/item-form'
import { JobRow } from '#/components/job-row'
import { Panel, PanelBody, PanelList } from '#/components/panel'
import { Tip } from '#/components/tip'
import { ListSkeleton } from '#/components/list-skeleton'
import { Timeline } from '#/components/timeline'
import { Button } from '#/components/ui/button'
import { InputGroup, InputGroupInput } from '#/components/ui/input-group'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { searchClients } from '../../../shared/search'

export const Route = createFileRoute('/_app/items/$itemId')({
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
  const [panel, setPanel] = useState<'edit' | 'move' | null>(null)
  if (!data) return <ListSkeleton />
  const { item, client } = data

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-2 px-4 pt-2">
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
      </header>

      <ExtraFieldsView fields={data.fields} values={item.extra} today={today} />

      <Panel
        title={business.words.job.plural}
        icon={ClipboardTextIcon}
        count={data.jobs.length || undefined}
      >
        <PanelList>
          {data.jobs.map((job) => (
            <JobRow key={job._id} job={job} today={today} />
          ))}
        </PanelList>
      </Panel>

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
              {panel === 'move' ? m.item_move_title() : item.name}
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
  const [query, setQuery] = useState('')
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
  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupInput
          autoFocus
          aria-label={m.clients_search()}
          placeholder={m.clients_search()}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      <div className="flex flex-col">
        {shown.map((client) => (
          <Button
            key={client._id}
            variant="ghost"
            className="h-12 justify-start rounded-xl text-base"
            onClick={() =>
              void move({ businessId, itemId, toClientId: client._id })
                .then(() => {
                  toast.success(m.item_moved())
                  onDone()
                })
                .catch((error: unknown) => toast.error(errorMessage(error)))
            }
          >
            {client.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
