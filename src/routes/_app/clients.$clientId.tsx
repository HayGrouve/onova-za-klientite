import {
  CaretRightIcon,
  ChatCircleIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  DotsThreeIcon,
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
import { ListExtras } from '#/components/list-extras'
import { AddressLink } from '#/components/address-link'
import { ClientAdmin } from '#/components/client-admin'
import { ClientForm } from '#/components/client-form'
import { Columns } from '#/components/columns'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { JobRow } from '#/components/job-row'
import { MoneyFigure } from '#/components/money/money-figure'
import { PaymentForm } from '#/components/money/payment-form'
import { PaymentSheet } from '#/components/money/payment-sheet'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { RemindersPanel } from '#/components/reminders/reminders-panel'
import { RefundForm } from '#/components/money/refund-form'
import { ListNote } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { MoreSection } from '#/components/more-section'
import { DetailError } from '#/components/not-found'
import { Panel, PanelBody, PanelList } from '#/components/panel'
import { Tip } from '#/components/tip'
import { Timeline } from '#/components/timeline'
import { Button, buttonVariants } from '#/components/ui/button'
import { DetailSheet, useDetailSheet } from '#/components/detail-sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { usePageTitle } from '#/hooks/use-page-title'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'
import { refundSources } from '../../../shared/allocation'
import { formatMoney } from '../../../shared/money'
import { defaultPaymentMethod } from '../../../shared/payment-method'
import { formatPhone, telHref, viberHref } from '../../../shared/phone-format'
import type { MorePart } from '../../../shared/more-summary'

// The payments list opens on the latest few; the rest are one tap away.
const PAYMENTS_SHOWN = 5

export const Route = createFileRoute('/_app/clients/$clientId')({
  staticData: { layout: 'wide' },
  component: ClientPage,
  // A wrong address, or a record from another business, says so (D16).
  errorComponent: ({ error }) => <DetailError error={error} kind="client" />,
})

function ClientPage() {
  const { business } = useViewer()
  const { clientId } = Route.useParams()
  const today = useToday()
  const data = useQuery(api.clients.get, {
    businessId: business._id,
    clientId,
  })
  usePageTitle(
    data && (data.client.isNoClient ? m.no_client() : data.client.name),
  )
  const sheet = useDetailSheet<{
    kind: 'edit' | 'payment' | 'refund' | 'reminder'
  }>()
  const [openPayment, setOpenPayment] = useState<Id<'payments'> | null>(null)
  const [allPayments, setAllPayments] = useState(false)
  const { words } = business

  if (!data) return <ListSkeleton />
  const { client } = data
  const phone = client.phones.at(0)?.e164

  // The folded parts, by name, with how many each holds.
  const { modules } = business
  const real = !client.isNoClient
  const moreSummary: MorePart[] = [
    ...(modules.items && real
      ? [{ name: words.item.plural, count: data.items.length }]
      : []),
    ...(modules.reminders && real
      ? [{ name: m.reminder_list(), count: data.reminders.length }]
      : []),
    ...(real ? [{ name: m.job_files() }] : []),
    ...(data.timeline.length > 0
      ? [{ name: m.client_history(), count: data.timeline.length }]
      : []),
  ]
  const shownPayments = allPayments
    ? data.payments
    : data.payments.slice(0, PAYMENTS_SHOWN)

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-3 px-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance break-words">
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
                    onClick={() => sheet.open({ kind: 'edit' })}
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

      {/* A wide screen puts who the client is on the left, with the folded
          rest under it, and their work and money on the right. */}
      <Columns
        layout="side-main"
        slots={[
          {
            key: 'contact',
            side: true,
            node: (
              <div className="flex flex-col gap-3 px-4 empty:hidden">
                {phone && (
                  <div className="flex gap-2">
                    <a
                      href={telHref(phone)}
                      className={buttonVariants({
                        size: 'xl',
                        className: 'flex-1',
                      })}
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
                {(client.phones.length > 0 ||
                  client.email ||
                  client.address) && (
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
                      <ContactRow
                        icon={EnvelopeSimpleIcon}
                        label={m.client_email()}
                      >
                        <span className="block truncate">{client.email}</span>
                      </ContactRow>
                    )}
                    {client.address && (
                      <ContactRow icon={MapPinIcon} label={m.client_address()}>
                        <AddressLink address={client.address} />
                      </ContactRow>
                    )}
                  </dl>
                )}
              </div>
            ),
          },
          {
            key: 'money',
            side: true,
            node: (data.owedCents > 0 || client.creditCents > 0) && (
              <section className="mx-4 grid animate-rise grid-cols-2 divide-x divide-border/70 overflow-hidden surface">
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
            ),
          },
          {
            key: 'extra',
            side: true,
            node: (
              <ExtraFieldsView
                fields={data.fields}
                values={client.extra}
                today={today}
              />
            ),
          },
          {
            key: 'note',
            side: true,
            node: client.note && (
              <Panel title={m.client_note()} icon={NoteIcon}>
                <PanelBody className="text-sm break-words whitespace-pre-wrap">
                  {client.note}
                </PanelBody>
              </Panel>
            ),
          },
          {
            key: 'jobs',
            node: (
              <Panel
                title={words.job.plural}
                icon={ClipboardTextIcon}
                count={data.jobs.length || undefined}
                action={
                  <Link
                    to="/new"
                    search={{ clientId: client._id }}
                    aria-label={m.new_job_label({ job: words.job.singular })}
                    className={buttonVariants({
                      variant: 'ghost',
                      className: 'h-11 text-primary lg:h-9',
                    })}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {words.job.singular}
                  </Link>
                }
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
            ),
          },
          {
            key: 'payments',
            node: (
              <Panel
                title={m.client_payments()}
                icon={WalletIcon}
                footer={
                  <>
                    <Button
                      size="xl"
                      className="flex-1 lg:max-w-60"
                      onClick={() => sheet.open({ kind: 'payment' })}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {m.pay_add()}
                    </Button>
                    {/* A refund is rare: it sits in a menu, as on the job. */}
                    {refundSources(client.creditCents, data.jobs).length >
                      0 && (
                      <DropdownMenu>
                        <Tip label={m.money_more()}>
                          <DropdownMenuTrigger
                            aria-label={m.money_more()}
                            className={buttonVariants({
                              variant: 'outline',
                              size: 'icon-xl',
                              className: 'size-12 aria-expanded:bg-muted',
                            })}
                          >
                            <DotsThreeIcon weight="bold" />
                          </DropdownMenuTrigger>
                        </Tip>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            className="min-h-11"
                            onClick={() => sheet.open({ kind: 'refund' })}
                          >
                            {m.refund_add()}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                }
              >
                <PanelList>
                  {data.payments.length === 0 ? (
                    <ListNote>{m.client_no_payments()}</ListNote>
                  ) : (
                    shownPayments.map((payment) => {
                      // The method is the title unless a label or a refund takes it.
                      const refund = payment.amountCents < 0
                      const titled =
                        payment.label ?? (refund ? m.refund_add() : undefined)
                      return (
                        <li key={payment._id}>
                          <button
                            type="button"
                            onClick={() => setOpenPayment(payment._id)}
                            className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left"
                          >
                            <span className="flex min-w-0 flex-col break-words">
                              <span>
                                {titled ?? METHOD_LABEL[payment.method]()}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatDay(payment.date, today)}
                                {titled &&
                                  ` · ${METHOD_LABEL[payment.method]()}`}
                              </span>
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatMoney(payment.amountCents)}
                            </span>
                          </button>
                        </li>
                      )
                    })
                  )}
                </PanelList>
                {data.payments.length > PAYMENTS_SHOWN && (
                  <Button
                    variant="ghost"
                    className="h-11 rounded-none border-t border-border/70 text-primary"
                    onClick={() => setAllPayments(!allPayments)}
                  >
                    {allPayments
                      ? m.payments_show_fewer()
                      : m.payments_show_all({ count: data.payments.length })}
                  </Button>
                )}
              </Panel>
            ),
          },
          {
            key: 'more',
            side: true,
            node: moreSummary.length > 0 && (
              <MoreSection page="client" summary={moreSummary}>
                {modules.items && real && (
                  <Panel
                    title={words.item.plural}
                    icon={StackIcon}
                    action={
                      <Link
                        to="/items/new"
                        search={{ clientId: client._id }}
                        className={buttonVariants({
                          variant: 'ghost',
                          className: 'h-11 text-primary lg:h-9',
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
                            className="flex items-center justify-between gap-3 pressable px-4 py-3"
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="font-medium break-words">
                                {item.name}
                              </span>
                              <ListExtras target="item" values={item.extra} />
                            </span>
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
                {modules.reminders && real && (
                  <RemindersPanel
                    reminders={data.reminders}
                    on="client"
                    today={today}
                    onAdd={() => sheet.open({ kind: 'reminder' })}
                  />
                )}
                {real && (
                  <Panel title={m.job_files()} icon={PaperclipIcon}>
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
                    title={m.client_history()}
                    icon={ClockCounterClockwiseIcon}
                  >
                    <PanelBody className="px-0">
                      <Timeline items={data.timeline} />
                    </PanelBody>
                  </Panel>
                )}
              </MoreSection>
            ),
          },
        ]}
      />

      <DetailSheet
        sheet={sheet}
        title={
          sheet.panel?.kind === 'payment'
            ? m.pay_title()
            : sheet.panel?.kind === 'refund'
              ? m.refund_title()
              : sheet.panel?.kind === 'reminder'
                ? m.reminder_add_title()
                : client.name
        }
      >
        {sheet.panel?.kind === 'edit' && (
          <ClientForm
            businessId={business._id}
            client={client}
            fields={data.fields}
            onSaved={sheet.close}
            onDirtyChange={sheet.setDirty}
          />
        )}
        {sheet.panel?.kind === 'payment' && (
          <PaymentForm
            businessId={business._id}
            target={{
              kind: 'client',
              clientId: client._id,
              openJobs: data.jobs.filter((job) => job.owes),
            }}
            today={today}
            depositsOn={business.depositsOnNewJob}
            defaultMethod={defaultPaymentMethod(data.payments)}
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'refund' && (
          <RefundForm
            businessId={business._id}
            clientId={client._id}
            sources={refundSources(client.creditCents, data.jobs)}
            today={today}
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'reminder' && (
          <ReminderForm
            businessId={business._id}
            target={{ clientId: client._id }}
            initialDate={today}
            onDone={sheet.close}
          />
        )}
      </DetailSheet>
      <PaymentSheet
        businessId={business._id}
        paymentId={openPayment}
        today={today}
        onClose={() => setOpenPayment(null)}
      />
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
