import {
  ChatCircleIcon,
  PencilSimpleIcon,
  PhoneIcon,
} from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientForm } from '#/components/client-form'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { JobRow } from '#/components/job-row'
import { ListSection } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { Timeline } from '#/components/timeline'
import { Button, buttonVariants } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'
import { formatPhone, telHref, viberHref } from '../../../shared/phone'

export const Route = createFileRoute('/_app/clients/$clientId')({
  component: ClientPage,
})

function ClientPage() {
  const { business } = useViewer()
  const { clientId } = Route.useParams()
  const today = useToday()
  const data = useQuery(api.clients.get, {
    businessId: business._id,
    clientId: clientId as Id<'clients'>,
  })
  const [editing, setEditing] = useState(false)
  const { words } = business

  if (!data) return <ListSkeleton />
  const { client } = data
  const phone = client.phones.at(0)?.e164

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex flex-col gap-3 px-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.isNoClient ? m.no_client() : client.name}
          </h1>
          {!client.isNoClient && (
            <Button
              variant="ghost"
              size="icon-xl"
              aria-label={m.client_edit()}
              onClick={() => setEditing(true)}
            >
              <PencilSimpleIcon />
            </Button>
          )}
        </div>
        {client.isNoClient && (
          <p className="text-sm text-muted-foreground">
            {m.client_no_client_note()}
          </p>
        )}
        {phone && (
          <div className="flex gap-2">
            <a
              href={telHref(phone)}
              className={buttonVariants({ size: 'xl', className: 'flex-1' })}
            >
              <PhoneIcon data-icon="inline-start" />
              {m.client_call()}
            </a>
            <a
              href={viberHref(phone)}
              className={buttonVariants({
                variant: 'outline',
                size: 'xl',
                className: 'flex-1',
              })}
            >
              <ChatCircleIcon data-icon="inline-start" />
              {m.client_viber()}
            </a>
          </div>
        )}
        <dl className="flex flex-col gap-1 text-sm">
          {client.phones.map((item) => (
            <div key={item.e164} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">
                {m.client_phone()}
              </dt>
              <dd>
                <a
                  href={telHref(item.e164)}
                  className="underline-offset-4 hover:underline"
                >
                  {formatPhone(item.e164)}
                </a>
              </dd>
            </div>
          ))}
          {client.email && (
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">
                {m.client_email()}
              </dt>
              <dd className="min-w-0 truncate">{client.email}</dd>
            </div>
          )}
          {client.address && (
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">
                {m.client_address()}
              </dt>
              <dd>{client.address}</dd>
            </div>
          )}
        </dl>
      </header>

      {(data.owedCents > 0 || client.creditCents > 0) && (
        <div className="mx-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted p-3">
            <div className="text-sm text-muted-foreground">
              {m.client_owes_total()}
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatMoney(data.owedCents)}
            </div>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <div className="text-sm text-muted-foreground">
              {m.client_credit()}
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatMoney(client.creditCents)}
            </div>
          </div>
        </div>
      )}

      <ExtraFieldsView
        fields={data.fields}
        values={client.extra}
        today={today}
      />
      {client.note && (
        <p className="px-4 text-sm whitespace-pre-wrap">{client.note}</p>
      )}

      {business.modules.items && !client.isNoClient && (
        <ListSection
          title={words.item.plural}
          action={
            <Link
              to="/items/new"
              search={{ clientId: client._id }}
              className={buttonVariants({ variant: 'ghost', className: 'h-9' })}
            >
              {m.item_add()}
            </Link>
          }
        >
          {data.items.map((item) => (
            <li key={item._id}>
              <Link
                to="/items/$itemId"
                params={{ itemId: item._id }}
                className="block rounded-2xl px-4 py-3 font-medium hover:bg-muted/60"
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ListSection>
      )}

      <ListSection title={words.job.plural}>
        {data.jobs.length === 0 ? (
          <li className="px-4 text-sm text-muted-foreground">
            {m.client_no_jobs()}
          </li>
        ) : (
          data.jobs.map((job) => (
            <JobRow key={job._id} job={job} today={today} showClient={false} />
          ))
        )}
      </ListSection>

      <ListSection title={m.client_payments()}>
        {data.payments.length === 0 ? (
          <li className="px-4 text-sm text-muted-foreground">
            {m.client_no_payments()}
          </li>
        ) : (
          data.payments.map((payment) => (
            <li
              key={payment._id}
              className="flex items-baseline justify-between gap-3 px-4 py-2"
            >
              <span className="flex flex-col">
                <span>{payment.label ?? METHOD_LABEL[payment.method]()}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDay(payment.date, today)} ·{' '}
                  {METHOD_LABEL[payment.method]()}
                </span>
              </span>
              <span className="font-medium tabular-nums">
                {formatMoney(payment.amountCents)}
              </span>
            </li>
          ))
        )}
      </ListSection>

      {!client.isNoClient && (
        <section className="flex flex-col gap-2">
          <h2 className="px-4 text-sm font-semibold text-muted-foreground">
            {m.job_files()}
          </h2>
          <FileGallery
            businessId={business._id}
            target={{ kind: 'client', clientId: client._id }}
          />
        </section>
      )}

      {data.timeline.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-4 text-sm font-semibold text-muted-foreground">
            {m.client_history()}
          </h2>
          <Timeline items={data.timeline} />
        </section>
      )}

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
        >
          <SheetHeader>
            <SheetTitle>{client.name}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <ClientForm
              businessId={business._id}
              client={client}
              fields={data.fields}
              onSaved={() => setEditing(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
