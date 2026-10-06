import { CaretLeftIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { cn } from 'cn'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { ListSection } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { CostForm } from '#/components/money/cost-form'
import { PageTitle } from '#/components/page'
import { Button } from '#/components/ui/button'
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
import { addMonths, monthOf } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'

export const Route = createFileRoute('/_app/money')({ component: MoneyPage })

const MONTH = new Intl.DateTimeFormat('bg-BG', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function Figure({
  label,
  cents,
  strong,
}: {
  label: string
  cents: number
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl p-3',
        strong ? 'bg-primary text-primary-foreground' : 'bg-muted',
      )}
    >
      <div
        className={cn(
          'text-sm',
          strong ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )}
      >
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">
        {formatMoney(cents)}
      </div>
    </div>
  )
}

function MoneyPage() {
  const { business } = useViewer()
  const today = useToday()
  const [month, setMonth] = useState(() => monthOf(today))
  const [costPanel, setCostPanel] = useState<{
    cost?: Pick<
      Doc<'costs'>,
      '_id' | 'label' | 'amountCents' | 'date' | 'note' | 'jobId'
    >
  } | null>(null)
  const data = useQuery(api.money.summary, { businessId: business._id, month })
  const costsOn = business.modules.costs
  const shift = (months: number) =>
    setMonth(monthOf(addMonths(`${month}-01`, months)))

  return (
    <>
      <PageTitle>{m.money_title()}</PageTitle>
      <div className="flex items-center justify-between gap-2 px-2 pb-3">
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={m.money_prev_month()}
          onClick={() => shift(-1)}
        >
          <CaretLeftIcon />
        </Button>
        <span className="text-base font-medium capitalize">
          {MONTH.format(new Date(`${month}-15T12:00:00Z`))}
        </span>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={m.money_next_month()}
          disabled={month >= monthOf(today)}
          onClick={() => shift(1)}
        >
          <CaretRightIcon />
        </Button>
      </div>

      {!data ? (
        <ListSkeleton />
      ) : (
        <div className="flex flex-col gap-5 pb-6">
          <div className="grid grid-cols-2 gap-2 px-4">
            <Figure
              label={m.money_received()}
              cents={data.receivedCents}
              strong={!costsOn}
            />
            {costsOn && (
              <Figure label={m.money_costs()} cents={data.costCents} />
            )}
            {costsOn && (
              <div className="col-span-2">
                <Figure
                  label={m.money_profit()}
                  cents={data.profitCents}
                  strong
                />
              </div>
            )}
            <Figure label={m.money_still_owed()} cents={data.stillOwedCents} />
            <Figure
              label={m.money_credit_held()}
              cents={data.creditHeldCents}
            />
          </div>

          <ListSection title={m.money_who_owes()}>
            {data.whoOwesMe.length === 0 ? (
              <li className="px-4 text-sm text-muted-foreground">
                {m.money_who_owes_none()}
              </li>
            ) : (
              data.whoOwesMe.map((row) => (
                <li key={row.clientId}>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: row.clientId }}
                    className="flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3 hover:bg-muted/60"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {row.isNoClient ? m.no_client() : row.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {m.money_jobs_count({
                          jobs: business.words.job.plural,
                          count: row.jobs,
                        })}
                        {row.doneJobs > 0 && ` · ${m.money_done_marker()}`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(row.owedCents)}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ListSection>

          <ListSection title={m.money_payments()}>
            {data.payments.length === 0 ? (
              <li className="px-4 text-sm text-muted-foreground">
                {m.money_none()}
              </li>
            ) : (
              data.payments.map((payment) => (
                <li key={payment._id}>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: payment.clientId }}
                    className="flex items-baseline justify-between gap-3 px-4 py-2 hover:bg-muted/60"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{payment.clientName}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDay(payment.date, today)} ·{' '}
                        {payment.label ?? METHOD_LABEL[payment.method]()}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(payment.amountCents)}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ListSection>

          {costsOn && (
            <ListSection
              title={m.money_costs_list()}
              action={
                <Button
                  variant="ghost"
                  className="h-9"
                  onClick={() => setCostPanel({})}
                >
                  <PlusIcon data-icon="inline-start" />
                  {m.cost_add()}
                </Button>
              }
            >
              {data.costs.length === 0 ? (
                <li className="px-4 text-sm text-muted-foreground">
                  {m.money_none()}
                </li>
              ) : (
                data.costs.map((cost) => (
                  <li key={cost._id}>
                    {cost.jobId ? (
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: cost.jobId }}
                        className="flex items-baseline justify-between gap-3 px-4 py-2 hover:bg-muted/60"
                      >
                        <CostLine cost={cost} today={today} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCostPanel({ cost })}
                        className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-muted/60"
                      >
                        <CostLine cost={cost} today={today} />
                      </button>
                    )}
                  </li>
                ))
              )}
            </ListSection>
          )}
          <p className="px-4 text-xs text-muted-foreground">
            {m.money_workers_hidden()}
          </p>
        </div>
      )}

      <Sheet
        open={costPanel !== null}
        onOpenChange={(open) => !open && setCostPanel(null)}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
        >
          <SheetHeader>
            <SheetTitle>{m.cost_general()}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {costPanel && (
              <CostForm
                businessId={business._id}
                cost={costPanel.cost}
                today={today}
                onDone={() => setCostPanel(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
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
