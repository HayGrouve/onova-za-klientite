import {
  BellIcon,
  CaretRightIcon,
  ChatCircleIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  EnvelopeSimpleIcon,
  MapPinIcon,
  NoteIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  StackIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientAdmin } from '#/components/client-admin'
import { ClientForm } from '#/components/client-form'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { JobRow } from '#/components/job-row'
import { MoneyFigure } from '#/components/money/money-figure'
import { PaymentForm } from '#/components/money/payment-form'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { ReminderRow } from '#/components/reminders/reminder-row'
import { RefundForm } from '#/components/money/refund-form'
import { RemovePayment } from '#/components/money/remove-payment'
import { ListNote } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { Panel, PanelBody, PanelList } from '#/components/panel'
import { Tip } from '#/components/tip'
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
import { formatPhone, telHref, viberHref } from '../../../shared/phone-format'

export const Route = createFileRoute('/_app/clients/$clientId')({
  staticData: { layout: 'wide' },
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
  const [panel, setPanel] = useState<
    | { kind: 'edit' }
    | { kind: 'payment' }
    | { kind: 'refund' }
    | { kind: 'removePayment'; paymentId: Id<'payments'>; amountCents: number }
    | { kind: 'reminder' }
    | null
  >(null)
  const close = () => setPanel(null)
  const reminders = useQuery(
    api.reminders.forClient,
    business.modules.reminders
      ? { businessId: business._id, clientId: clientId as Id<'clients'> }
      : 'skip',
  )
  const { words } = business

  if (!data) return <ListSkeleton />
  const { client } = data
  const phone = client.phones.at(0)?.e164

  return (
    // A wide screen puts who the client is on the left and their work and
    // money on the right. The phone keeps one column, in `order-*` order.
    <div className="flex flex-col gap-4 pb-6 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <header className="flex flex-col gap-3 px-4 pt-2 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.isNoClient ? m.no_client() : client.name}
          </h1>
          <div className="flex shrink-0 items-center">
            <ClientAdmin businessId={business._id} client={client} />
            {!client.isNoClient &&
              !client.anonymizedAt &&
              !client.mergedIntoId && (
                <Tip label={m.client_edit()}>
                  <Button
                    variant="ghost"
                    size="icon-xl"
                    aria-label={m.client_edit()}
                    onClick={() => setPanel({ kind: 'edit' })}
                  >
                    <PencilSimpleIcon />
                  </Button>
                </Tip>
              )}
          </div>
        </div>
        {client.isNoClient && (
          <p className="text-sm text-muted-foreground">
            {m.client_no_client_note()}
          </p>
        )}
        {client.anonymizedAt && (
          <p className="text-sm text-muted-foreground">
            {m.client_anonymized_note()}
          </p>
        )}
        {client.mergedIntoId && (
          <Link
            to="/clients/$clientId"
            params={{ clientId: client.mergedIntoId }}
            className="text-sm text-primary underline underline-offset-4"
          >
            {m.client_merged_note({ name: data.mergedIntoName ?? '' })}
          </Link>
        )}
      </header>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <div className="order-1 flex flex-col gap-3 px-4 empty:hidden lg:order-none">
          {phone && (
            <div className="flex gap-2">
              <a
                href={telHref(phone)}
                className={buttonVariants({ size: 'xl', className: 'flex-1' })}
              >
                <PhoneIcon data-icon="inline-start" weight="fill" />
                {m.client_call()}
              </a>
              <a
                href={viberHref(phone)}
                className={cn(
                  buttonVariants({
                    variant: 'outline',
                    size: 'xl',
                    className: 'flex-1',
                  }),
                )}
              >
                {/* Viber's own purple, so the button is recognised at a glance. */}
                <ChatCircleIcon
                  data-icon="inline-start"
                  weight="fill"
                  className="text-[#7360f2]"
                />
                {m.client_viber()}
              </a>
            </div>
          )}
          {(client.phones.length > 0 || client.email || client.address) && (
            <dl className="flex animate-rise flex-col divide-y divide-border/70 overflow-hidden surface text-sm">
              {client.phones.map((item) => (
                <ContactRow
                  key={item.e164}
                  icon={PhoneIcon}
                  label={m.client_phone()}
                >
                  <a
                    href={telHref(item.e164)}
                    className="underline-offset-4 hover:underline"
                  >
                    {formatPhone(item.e164)}
                  </a>
                </ContactRow>
              ))}
              {client.email && (
                <ContactRow icon={EnvelopeSimpleIcon} label={m.client_email()}>
                  <span className="block truncate">{client.email}</span>
                </ContactRow>
              )}
              {client.address && (
                <ContactRow icon={MapPinIcon} label={m.client_address()}>
                  {client.address}
                </ContactRow>
              )}
            </dl>
          )}
        </div>

        {(data.owedCents > 0 || client.creditCents > 0) && (
          <section className="order-2 mx-4 grid animate-rise grid-cols-2 divide-x divide-border/70 overflow-hidden surface">
            <MoneyFigure
              label={m.client_owes_total()}
              cents={data.owedCents}
              hint={m.hint_owes_total()}
              emphasis={data.owedCents > 0 ? 'primary' : undefined}
            />
            <MoneyFigure
              label={m.client_credit()}
              cents={client.creditCents}
              hint={m.hint_credit()}
            />
          </section>
        )}

        <div className="order-3 empty:hidden lg:order-none">
          <ExtraFieldsView
            fields={data.fields}
            values={client.extra}
            today={today}
          />
        </div>
        {client.note && (
          <Panel
            className="order-4 lg:order-none"
            title={m.client_note()}
            icon={NoteIcon}
          >
            <PanelBody className="text-sm whitespace-pre-wrap">
              {client.note}
            </PanelBody>
          </Panel>
        )}

        {business.modules.items && !client.isNoClient && (
          <Panel
            className="order-7 lg:order-none"
            title={words.item.plural}
            icon={StackIcon}
            action={
              <Link
                to="/items/new"
                search={{ clientId: client._id }}
                className={buttonVariants({
                  variant: 'ghost',
                  className: 'h-9 text-primary',
                })}
              >
                <PlusIcon data-icon="inline-start" />
                {m.item_add()}
              </Link>
            }
          >
            <PanelList>
              {data.items.map((item) => (
                <li key={item._id}>
                  <Link
                    to="/items/$itemId"
                    params={{ itemId: item._id }}
                    className="flex items-center justify-between gap-3 pressable px-4 py-3 font-medium"
                  >
                    {item.name}
                    <CaretRightIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground/60"
                    />
                  </Link>
                </li>
              ))}
            </PanelList>
          </Panel>
        )}

        {business.modules.reminders && !client.isNoClient && (
          <Panel
            className="order-8 lg:order-none"
            title={m.reminder_list()}
            icon={BellIcon}
            action={
              <Button
                variant="ghost"
                className="h-9 text-primary"
                onClick={() => setPanel({ kind: 'reminder' })}
              >
                <PlusIcon data-icon="inline-start" />
                {m.reminder_add()}
              </Button>
            }
          >
            <PanelList>
              {(reminders ?? []).map((reminder) => (
                <ReminderRow
                  key={reminder._id}
                  reminderId={reminder._id}
                  note={reminder.note}
                  detail={formatDay(reminder.date, today)}
                />
              ))}
            </PanelList>
          </Panel>
        )}
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <Panel
          className="order-5 lg:order-none"
          title={words.job.plural}
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
                />
              ))
            )}
          </PanelList>
        </Panel>

        <Panel
          className="order-6 lg:order-none"
          title={m.client_payments()}
          icon={WalletIcon}
          footer={
            <>
              <Button size="xl" onClick={() => setPanel({ kind: 'payment' })}>
                <PlusIcon data-icon="inline-start" />
                {m.pay_add()}
              </Button>
              {client.creditCents > 0 && (
                <Button
                  variant="outline"
                  size="xl"
                  onClick={() => setPanel({ kind: 'refund' })}
                >
                  {m.refund_add()}
                </Button>
              )}
            </>
          }
        >
          <PanelList>
            {data.payments.length === 0 ? (
              <ListNote>{m.client_no_payments()}</ListNote>
            ) : (
              data.payments.map((payment) => (
                <li key={payment._id}>
                  <button
                    type="button"
                    onClick={() =>
                      setPanel({
                        kind: 'removePayment',
                        paymentId: payment._id,
                        amountCents: payment.amountCents,
                      })
                    }
                    className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left"
                  >
                    <span className="flex flex-col">
                      <span>
                        {payment.label ?? METHOD_LABEL[payment.method]()}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatDay(payment.date, today)} ·{' '}
                        {METHOD_LABEL[payment.method]()}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(payment.amountCents)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </PanelList>
        </Panel>

        {!client.isNoClient && (
          <Panel
            className="order-9 lg:order-none"
            title={m.job_files()}
            icon={PaperclipIcon}
          >
            <PanelBody className="px-0">
              <FileGallery
                businessId={business._id}
                target={{ kind: 'client', clientId: client._id }}
              />
            </PanelBody>
          </Panel>
        )}

        {data.timeline.length > 0 && (
          <Panel
            className="order-10 lg:order-none"
            title={m.client_history()}
            icon={ClockCounterClockwiseIcon}
          >
            <PanelBody className="px-0">
              <Timeline items={data.timeline} />
            </PanelBody>
          </Panel>
        )}
      </div>

      <Sheet open={panel !== null} onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
        >
          <SheetHeader>
            <SheetTitle>
              {panel?.kind === 'payment'
                ? m.pay_title()
                : panel?.kind === 'refund'
                  ? m.refund_title()
                  : panel?.kind === 'removePayment'
                    ? m.pay_remove()
                    : panel?.kind === 'reminder'
                      ? m.reminder_add_title()
                      : client.name}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {panel?.kind === 'edit' && (
              <ClientForm
                businessId={business._id}
                client={client}
                fields={data.fields}
                onSaved={close}
              />
            )}
            {panel?.kind === 'payment' && (
              <PaymentForm
                businessId={business._id}
                target={{
                  kind: 'client',
                  clientId: client._id,
                  openJobs: data.jobs.filter((job) => job.owes),
                }}
                today={today}
                depositsOn={business.depositsOnNewJob}
                onDone={close}
              />
            )}
            {panel?.kind === 'refund' && (
              <RefundForm
                businessId={business._id}
                clientId={client._id}
                creditCents={client.creditCents}
                today={today}
                onDone={close}
              />
            )}
            {panel?.kind === 'reminder' && (
              <ReminderForm
                businessId={business._id}
                target={{ clientId: client._id }}
                initialDate={today}
                onDone={close}
              />
            )}
            {panel?.kind === 'removePayment' && (
              <RemovePayment
                businessId={business._id}
                paymentId={panel.paymentId}
                amountCents={panel.amountCents}
                onDone={close}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ContactRow({
  icon: IconComponent,
  label,
  children,
}: {
  icon: Icon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <IconComponent
        aria-hidden
        className="size-5 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="min-w-0">{children}</dd>
      </div>
    </div>
  )
}
