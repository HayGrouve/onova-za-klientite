import { DotsThreeVerticalIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ListSkeleton } from '#/components/list-skeleton'
import { Tip } from '#/components/tip'
import { useSubmit } from '#/components/money/use-submit'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { InputGroup, InputGroupInput } from '#/components/ui/input-group'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'
import { searchClients } from '../../shared/search'

/** Merge a duplicate into another client, or anonymize on request (GDPR). */
export function ClientAdmin({
  businessId,
  client,
}: {
  businessId: Id<'businesses'>
  client: Doc<'clients'>
}) {
  const [panel, setPanel] = useState<'merge' | 'anonymize' | null>(null)
  if (client.isNoClient || client.mergedIntoId || client.anonymizedAt)
    return null
  return (
    <>
      <DropdownMenu>
        <Tip label={m.client_actions()}>
          <DropdownMenuTrigger
            aria-label={m.client_actions()}
            className="flex size-11 items-center justify-center rounded-xl transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-foreground/5"
          >
            <DotsThreeVerticalIcon className="size-6" />
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className="min-h-11"
            onClick={() => setPanel('merge')}
          >
            {m.client_merge()}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            variant="destructive"
            onClick={() => setPanel('anonymize')}
          >
            {m.client_anonymize()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
              {panel === 'merge'
                ? m.client_merge_title()
                : m.client_anonymize_title()}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {panel === 'merge' && (
              <MergePicker
                businessId={businessId}
                client={client}
                onDone={() => setPanel(null)}
              />
            )}
            {panel === 'anonymize' && (
              <Anonymize
                businessId={businessId}
                clientId={client._id}
                onDone={() => setPanel(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function MergePicker({
  businessId,
  client,
  onDone,
}: {
  businessId: Id<'businesses'>
  client: Doc<'clients'>
  onDone: () => void
}) {
  const clients = useQuery(api.clients.list, { businessId })
  const merge = useMutation(api.clientsAdmin.merge)
  const navigate = useNavigate()
  const { busy, run } = useSubmit(onDone)
  const [query, setQuery] = useState('')
  const [intoId, setIntoId] = useState<Id<'clients'> | null>(null)
  if (!clients) return <ListSkeleton />
  const candidates = clients
    .filter((item) => !item.isNoClient && item._id !== client._id)
    .map((item) => ({
      ...item,
      id: item._id,
      phones: item.phone ? [item.phone] : [],
    }))
  const shown = query.trim()
    ? searchClients(candidates, query, 20)
    : candidates.slice(0, 20)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {m.client_merge_body({ from: client.name })}
      </p>
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
        {shown.map((item) => (
          <Button
            key={item._id}
            variant={intoId === item._id ? 'secondary' : 'ghost'}
            aria-pressed={intoId === item._id}
            className="h-12 justify-start rounded-xl text-base"
            onClick={() => setIntoId(item._id)}
          >
            {item.name}
          </Button>
        ))}
      </div>
      <Button
        size="xl"
        variant="destructive"
        disabled={busy || !intoId}
        onClick={() =>
          intoId &&
          void run(async () => {
            await merge({ businessId, fromId: client._id, intoId })
            await navigate({
              to: '/clients/$clientId',
              params: { clientId: intoId },
              replace: true,
            })
          })
        }
      >
        {busy && <Spinner data-icon="inline-start" />}
        {m.client_merge_confirm()}
      </Button>
    </div>
  )
}

function Anonymize({
  businessId,
  clientId,
  onDone,
}: {
  businessId: Id<'businesses'>
  clientId: Id<'clients'>
  onDone: () => void
}) {
  const anonymize = useMutation(api.clientsAdmin.anonymize)
  const { busy, run } = useSubmit(onDone)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{m.client_anonymize_body()}</p>
      <Button
        size="xl"
        variant="destructive"
        disabled={busy}
        onClick={() => void run(() => anonymize({ businessId, clientId }))}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {m.client_anonymize_confirm()}
      </Button>
    </div>
  )
}
