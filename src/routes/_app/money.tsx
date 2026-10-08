import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CreditCardIcon,
  DotsThreeCircleIcon,
  HandCoinsIcon,
  HourglassMediumIcon,
  MoneyIcon,
  PhoneIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { cn } from 'cn'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { InitialsAvatar } from '#/components/initials-avatar'
import { ListNote } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { ClientPaymentSheet } from '#/components/money/client-payment-sheet'
import { PaymentSheet } from '#/components/money/payment-sheet'
import { CostForm } from '#/components/money/cost-form'
import { MoneyFigure } from '#/components/money/money-figure'
import { PageTitle } from '#/components/page'
import { Panel, PanelList } from '#/components/panel'
import { Tip } from '#/components/tip'
import { Button, buttonVariants } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { BottomSheet } from '#/components/bottom-sheet'
import { useSheetGuard } from '#/hooks/use-discard-guard'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { m } from '#/paraglide/messages.js'
import { addMonths, monthOf } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'
import { telHref } from '../../../shared/phone-format'

export const Route = createFileRoute('/_app/money')({
  // The month is in the address, so Back returns to the month that was open.
  validateSearch: (search: Record<string, unknown>): { month?: string } =>
    typeof search.month === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
      ? { month: search.month }
      : {},
  staticData: { layout: 'wide' },
  component: MoneyPage,
})

const MONTH = new Intl.DateTimeFormat('bg-BG', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function monthLabel(month: string) {
  const text = MONTH.format(new Date(`${month}-15T12:00:00Z`))
  return text.charAt(0).toLocaleUpperCase('bg') + text.slice(1)
}

const METHOD_ICON: Record<Doc<'payments'>['method'], Icon> = {
  cash: MoneyIcon,
  bank: BankIcon,
  card: CreditCardIcon,
  other: DotsThreeCircleIcon,
}

function MoneyPage() {
  const { business } = useViewer()
  const today = useToday()
  const thisMonth = monthOf(today)
  const navigate = useNavigate({ from: Route.fullPath })
  const picked = Route.useSearch({ select: (search) => search.month })
  // Never past the current month, whatever the address says.
  const month = picked && picked <= thisMonth ? picked : thisMonth
  const setMonth = (next: string) =>
    void navigate({
      search: { month: next === thisMonth ? undefined : next },
      replace: true,
    })
  const [costPanel, setCostPanel] = useState<{
    cost?: Pick<
      Doc<'costs'>,
      '_id' | 'label' | 'amountCents' | 'date' | 'note' | 'jobId'
    >
  } | null>(null)
  const [openPayment, setOpenPayment] = useState<Id<'payments'> | null>(null)
  const guard = useSheetGuard()
  const [payClient, setPayClient] = useState<{
    _id: Id<'clients'>
    name: string
  } | null>(null)
  const data = useQuery(api.money.summary, { businessId: business._id, month })
  const costsOn = business.modules.costs
  const shift = (months: number) =>
    setMonth(monthOf(addMonths(`${month}-01`, months)))

  return (
    <>
      <PageTitle>{m.money_title()}</PageTitle>
      {/* A wide screen: the month beside the balances, then who owes me
          beside the month's payments and costs. The phone keeps one column in
          the same order. */}
      <div className="flex flex-col gap-4 pb-6 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="contents lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-stretch">
          {/* The month and what happened in it. */}
          <section className="mx-4 flex flex-col overflow-hidden surface">
            <div className="flex items-center justify-between gap-2 p-1">
              <Tip label={m.money_prev_month()}>
                <Button
                  variant="ghost"
                  size="icon-xl"
                  aria-label={m.money_prev_month()}
                  onClick={() => shift(-1)}
                >
                  <CaretLeftIcon />
                </Button>
              </Tip>
              {/* Keyed by the month, so the label fades in when it changes. */}
              <h2 key={month} className="animate-page text-base font-semibold">
                {monthLabel(month)}
              </h2>
              <Tip label={m.money_next_month()}>
                <Button
                  variant="ghost"
                  size="icon-xl"
                  aria-label={m.money_next_month()}
                  disabled={month >= monthOf(today)}
                  onClick={() => shift(1)}
                >
                  <CaretRightIcon />
                </Button>
              </Tip>
            </div>
            {!data ? (
              <div className="flex flex-col gap-2 border-t border-border/70 p-4">
                <Skeleton className="h-4 w-1/3 rounded-full" />
                <Skeleton className="h-7 w-1/2 rounded-full" />
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    'grid divide-x divide-border/70 border-t border-border/70',
                    costsOn ? 'grid-cols-2' : 'grid-cols-1',
                  )}
                >
                  <MoneyFigure
                    label={m.money_received()}
                    cents={data.receivedCents}
                    icon={ArrowDownLeftIcon}
                    hint={m.hint_received()}
                  />
                  {costsOn && (
                    <MoneyFigure
                      label={m.money_costs()}
                      cents={data.costCents}
                      icon={ArrowUpRightIcon}
                      hint={m.hint_costs()}
                    />
                  )}
                </div>
                {costsOn && (
                  <div className="border-t border-border/70 bg-muted/30">
                    <MoneyFigure
                      label={m.money_profit()}
                      cents={data.profitCents}
                      icon={data.profitCents < 0 ? TrendDownIcon : TrendUpIcon}
                      hint={m.hint_monthly_profit()}
                      emphasis={
                        data.profitCents < 0
                          ? 'negative'
                          : data.profitCents > 0
                            ? 'positive'
                            : undefined
                      }
                    />
                  </div>
                )}
              </>
            )}
          </section>
          {data && (
            <>
              {/* Balances as of today, whatever the month. */}
              <section className="mx-4 grid animate-rise grid-cols-2 divide-x divide-border/70 overflow-hidden surface lg:grid-cols-1 lg:grid-rows-2 lg:divide-x-0 lg:divide-y">
                <MoneyFigure
                  label={m.money_still_owed()}
                  cents={data.stillOwedCents}
                  icon={HourglassMediumIcon}
                  hint={m.hint_still_owed()}
                  emphasis={data.stillOwedCents > 0 ? 'primary' : undefined}
                />
                <MoneyFigure
                  label={m.money_credit_held()}
                  cents={data.creditHeldCents}
                  icon={PiggyBankIcon}
                  hint={m.hint_credit()}
                />
              </section>
            </>
          )}
        </div>

        {!data ? (
          <ListSkeleton />
        ) : (
          <>
            <div className="contents lg:flex lg:flex-col lg:gap-4">
              <Panel
                title={m.money_who_owes()}
                icon={HandCoinsIcon}
                count={data.whoOwesMe.length || undefined}
              >
                <PanelList>
                  {data.whoOwesMe.length === 0 ? (
                    <ListNote>{m.money_who_owes_none()}</ListNote>
                  ) : (
                    data.whoOwesMe.map((row) => {
                      const name = row.isNoClient ? m.no_client() : row.name
                      // Owed money splits by stage group: finished work, and the rest.
                      const goingCents = row.owedCents - row.doneOwedCents
                      return (
                        <li
                          key={row.clientId}
                          className="flex flex-col pb-3 row-lazy"
                        >
                          <Link
                            to="/clients/$clientId"
                            params={{ clientId: row.clientId }}
                            className="flex items-center gap-3 pressable px-4 pt-3 pb-2"
                          >
                            <InitialsAvatar
                              name={name}
                              className="size-9 text-xs"
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate font-medium">
                                {name}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {m.money_jobs_count({
                                  jobs: business.words.job.plural,
                                  count: row.jobs,
                                })}
                              </span>
                              <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                                {row.doneOwedCents > 0 && (
                                  <span>
                                    {m.money_owed_done({
                                      amount: formatMoney(row.doneOwedCents),
                                    })}
                                  </span>
                                )}
                                {goingCents > 0 && (
                                  <span>
                                    {m.money_owed_going({
                                      amount: formatMoney(goingCents),
                                    })}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="font-semibold tabular-nums">
                              {formatMoney(row.owedCents)}
                            </span>
                          </Link>
                          {/* Under the name, so the row stays readable on a phone. */}
                          <div className="flex items-center gap-2 pr-4 pl-16">
                            {row.phone && (
                              <Tip label={m.client_call()}>
                                <a
                                  href={telHref(row.phone)}
                                  aria-label={m.money_call({ name })}
                                  className={buttonVariants({
                                    variant: 'outline',
                                    size: 'icon-lg',
                                    className: 'size-10 text-primary',
                                  })}
                                >
                                  <PhoneIcon weight="fill" />
                                </a>
                              </Tip>
                            )}
                            <Button
                              variant="outline"
                              className="h-10 px-3"
                              aria-label={m.money_pay({ name })}
                              onClick={() =>
                                setPayClient({ _id: row.clientId, name })
                              }
                            >
                              <PlusIcon data-icon="inline-start" />
                              {m.pay_add()}
                            </Button>
                          </div>
                        </li>
                      )
                    })
                  )}
                </PanelList>
              </Panel>
            </div>
            <div className="contents lg:flex lg:flex-col lg:gap-4">
              <Panel title={m.money_payments()} icon={ArrowDownLeftIcon}>
                <PanelList>
                  {data.payments.length === 0 ? (
                    <ListNote>{m.money_none()}</ListNote>
                  ) : (
                    data.payments.map((payment) => (
                      <li key={payment._id} className="row-lazy">
                        {/* Opens the payment itself: its split, edit, delete. */}
                        <button
                          type="button"
                          onClick={() => setOpenPayment(payment._id)}
                          className="flex w-full items-center gap-3 pressable px-4 py-2.5 text-left"
                        >
                          <MethodBadge method={payment.method} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">
                              {payment.clientName}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {[
                                paymentTarget(payment),
                                formatDay(payment.date, today),
                                payment.label ?? METHOD_LABEL[payment.method](),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {formatMoney(payment.amountCents)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </PanelList>
              </Panel>

              {costsOn && (
                <Panel
                  title={m.money_costs_list()}
                  icon={ReceiptIcon}
                  action={
                    <Button
                      variant="ghost"
                      className="h-9 text-primary"
                      onClick={() => setCostPanel({})}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {m.cost_add()}
                    </Button>
                  }
                >
                  <PanelList>
                    {data.costs.length === 0 ? (
                      <ListNote>{m.money_none()}</ListNote>
                    ) : (
                      data.costs.map((cost) => (
                        <li key={cost._id} className="row-lazy">
                          {cost.jobId ? (
                            <Link
                              to="/jobs/$jobId"
                              params={{ jobId: cost.jobId }}
                              className="flex items-baseline justify-between gap-3 pressable px-4 py-2.5"
                            >
                              <CostLine cost={cost} today={today} />
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCostPanel({ cost })}
                              className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left"
                            >
                              <CostLine cost={cost} today={today} />
                            </button>
                          )}
                        </li>
                      ))
                    )}
                  </PanelList>
                </Panel>
              )}
              <p className="px-4 text-xs text-muted-foreground">
                {m.money_workers_hidden()}
              </p>
            </div>
          </>
        )}
      </div>

      <ClientPaymentSheet
        client={payClient}
        today={today}
        onClose={() => setPayClient(null)}
      />
      <PaymentSheet
        businessId={business._id}
        paymentId={openPayment}
        today={today}
        onClose={() => setOpenPayment(null)}
      />
      <BottomSheet
        open={costPanel !== null}
        onClose={() => guard.close(() => setCostPanel(null))}
        title={m.cost_general()}
      >
        <div className="px-4 pb-6">
          {costPanel && (
            <CostForm
              businessId={business._id}
              cost={costPanel.cost}
              today={today}
              onDone={() => setCostPanel(null)}
              onDirtyChange={guard.setDirty}
            />
          )}
        </div>
      </BottomSheet>
      {guard.prompt}
    </>
  )
}

/** What a payment paid: the jobs it went to, and "prepaid" for what stayed with the client. */
function paymentTarget(payment: {
  amountCents: number
  jobs: Array<{ title: string }>
  creditCents: number
}) {
  const titles = payment.jobs.map((job) => job.title)
  const jobs =
    titles.length > 2
      ? m.money_jobs_more({
          titles: titles.slice(0, 2).join(', '),
          count: titles.length - 2,
        })
      : titles.join(', ')
  const credit =
    payment.creditCents > 0
      ? payment.amountCents < 0
        ? m.money_from_prepaid()
        : m.money_prepaid_short()
      : ''
  return [jobs, credit].filter(Boolean).join(' + ')
}

function CostLine({
  cost,
  today,
}: {
  cost: { label: string; date: string; amountCents: number; jobTitle?: string }
  today: string
}) {
  return (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{cost.label}</span>
        <span className="text-sm text-muted-foreground">
          {formatDay(cost.date, today)}
          {cost.jobTitle && ` · ${cost.jobTitle}`}
        </span>
      </span>
      <span className="tabular-nums">{formatMoney(cost.amountCents)}</span>
    </>
  )
}

/** The payment method as a small icon, so cash and bank tell apart at a glance. */
function MethodBadge({ method }: { method: Doc<'payments'>['method'] }) {
  const IconComponent = METHOD_ICON[method]
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
    >
      <IconComponent className="size-5" />
    </span>
  )
}
