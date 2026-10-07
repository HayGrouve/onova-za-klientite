import {
  BellIcon,
  CalendarBlankIcon,
  ClockCounterClockwiseIcon,
  FlagIcon,
  FlowArrowIcon,
  ListBulletsIcon,
  MapPinIcon,
  NoteIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  ReceiptIcon,
  StackIcon,
  WalletIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { cn } from 'cn'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { AppointmentForm } from '#/components/job/appointment-form'
import { RepeatSection } from '#/components/job/repeat-section'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { monthsLabel } from '#/components/setup/steps'
import { CostForm } from '#/components/money/cost-form'
import { MoneyFigure } from '#/components/money/money-figure'
import { PaymentForm } from '#/components/money/payment-form'
import { RefundForm } from '#/components/money/refund-form'
import { RemovePayment } from '#/components/money/remove-payment'
import { WriteOffForm } from '#/components/money/write-off-form'
import { JobEditForm } from '#/components/job/job-edit-form'
import { JobSummaryButton } from '#/components/job-summary-sheet'
import { LinesEditor } from '#/components/job/lines-editor'
import { Hint } from '#/components/hint'
import { InitialsAvatar } from '#/components/initials-avatar'
import { formatMoment } from '#/components/job-row'
import { ListCard, SectionHeader } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { Tip } from '#/components/tip'
import { StageBadge } from '#/components/stage-badge'
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
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { addMonths, isOverdue } from '../../../shared/dates'
import { formatMoney, lineTotalCents } from '../../../shared/money'
import { telHref } from '../../../shared/phone-format'

export const Route = createFileRoute('/_app/jobs/$jobId')({
  component: JobPage,
})

type Panel =
  | { kind: 'edit' }
  | { kind: 'lines' }
  | { kind: 'appointment'; appointment?: Doc<'appointments'> }
  | { kind: 'items' }
  | { kind: 'payment' }
  | { kind: 'refund' }
  | { kind: 'writeOff' }
  | { kind: 'cost'; cost?: Doc<'costs'> }
  | { kind: 'removePayment'; paymentId: Id<'payments'>; amountCents: number }
  | { kind: 'reminder'; rule: boolean }

function Section({
  title,
  icon,
  hint,
  action,
  children,
}: {
  title: string
  icon: Icon
  hint?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={title} icon={icon} hint={hint} action={action} />
      {children}
    </section>
  )
}

/** One fact about the job, with an icon in front. */
function InfoRow({
  icon: IconComponent,
  className,
  children,
}: {
  icon: Icon
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn('flex min-h-11 items-center gap-3 px-4 py-2', className)}
    >
      <IconComponent aria-hidden className="size-5 shrink-0 opacity-80" />
      <span className="min-w-0 text-sm">{children}</span>
    </div>
  )
}

function JobPage() {
  const { business } = useViewer()
  const { jobId } = Route.useParams()
  const today = useToday()
  const data = useQuery(api.jobs.get, {
    businessId: business._id,
    jobId: jobId as Id<'jobs'>,
  })
  const fields = useQuery(api.fields.list, {
    businessId: business._id,
    target: 'job',
  })
  const services = useQuery(api.services.list, { businessId: business._id })
  const changeStage = useMutation(api.jobs.changeStage)
  const applyCredit = useMutation(api.payments.useCredit)
  const removeWriteOff = useMutation(api.jobs.removeWriteOff)
  const [panel, setPanel] = useState<Panel | null>(null)
  const { words, modules } = business

  if (!data || !fields) return <ListSkeleton />
  const { job, client } = data
  const phone = client?.phones.at(0)?.e164
  const late =
    (job.stageGroup === 'new' || job.stageGroup === 'in_progress') &&
    isOverdue(job.dueDate, today)

  const moveTo = async (stageId: Id<'stages'>) => {
    try {
      await changeStage({ businessId: business._id, jobId: job._id, stageId })
      // Q5: reaching Done offers the reminder rule's reminder, pre-filled.
      const target = data.stages.find((stage) => stage._id === stageId)
      if (
        target?.group === 'done' &&
        job.stageGroup !== 'done' &&
        modules.reminders &&
        business.reminderRule
      ) {
        setPanel({ kind: 'reminder', rule: true })
      }
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  const close = () => setPanel(null)
  const editButton = (
    onClick: () => void,
    label = m.edit(),
    icon: Icon = PencilSimpleIcon,
  ) => {
    const ActionIcon = icon
    return (
      <Button variant="ghost" className="h-9 text-primary" onClick={onClick}>
        <ActionIcon data-icon="inline-start" />
        {label}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex flex-col gap-2 px-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {job.title}
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <JobSummaryButton businessId={business._id} jobId={job._id} />
            <Tip label={m.job_edit()}>
              <Button
                variant="ghost"
                size="icon-xl"
                aria-label={m.job_edit()}
                onClick={() => setPanel({ kind: 'edit' })}
              >
                <PencilSimpleIcon />
              </Button>
            </Tip>
          </div>
        </div>
        {(client || job.address || job.dueDate) && (
          <div className="flex animate-rise flex-col divide-y divide-border/70 overflow-hidden surface">
            {client && (
              <div className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
                <InitialsAvatar
                  name={client.isNoClient ? m.no_client() : client.name}
                  className="size-9 text-xs"
                />
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: client._id }}
                  className="min-w-0 flex-1 truncate text-base font-medium text-primary underline-offset-4 hover:underline"
                >
                  {client.isNoClient ? m.no_client() : client.name}
                </Link>
                {phone && (
                  <Tip label={m.client_call()}>
                    <a
                      href={telHref(phone)}
                      aria-label={m.client_call()}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'icon-xl',
                        className: 'text-primary',
                      })}
                    >
                      <PhoneIcon weight="fill" />
                    </a>
                  </Tip>
                )}
              </div>
            )}
            {job.address && (
              <InfoRow icon={MapPinIcon} className="text-muted-foreground">
                {job.address}
              </InfoRow>
            )}
            {job.dueDate && (
              <InfoRow
                icon={late ? WarningCircleIcon : FlagIcon}
                className={
                  late
                    ? 'bg-destructive/5 font-medium text-destructive'
                    : 'text-muted-foreground'
                }
              >
                {late
                  ? m.late_since({ date: formatDay(job.dueDate, today) })
                  : m.due_short({ date: formatDay(job.dueDate, today) })}
              </InfoRow>
            )}
          </div>
        )}
      </header>

      <Section
        title={m.job_stage()}
        icon={FlowArrowIcon}
        hint={<Hint term={m.job_stage()}>{m.hint_stage()}</Hint>}
      >
        <div
          className="flex flex-wrap gap-2 px-4"
          role="radiogroup"
          aria-label={m.job_stage()}
        >
          {data.stages.map((stage) => {
            const current = stage._id === job.stageId
            return (
              <button
                key={stage._id}
                type="button"
                role="radio"
                aria-checked={current}
                onClick={() => !current && void moveTo(stage._id)}
                className={cn(
                  'rounded-full ring-offset-2 ring-offset-canvas transition-[box-shadow,transform] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95',
                  current ? 'shadow-sm ring-2 ring-primary' : 'hover:shadow-sm',
                )}
              >
                <StageBadge
                  name={stage.name}
                  color={stage.color}
                  className="h-9 px-3.5 text-sm"
                />
              </button>
            )
          })}
        </div>
        {job.cancelReason && job.stageGroup === 'cancelled' && (
          <p className="px-4 text-sm text-muted-foreground">
            {m.job_cancel_reason()}: {job.cancelReason}
          </p>
        )}
      </Section>

      {modules.appointments && (
        <Section
          title={words.appointment.plural}
          icon={CalendarBlankIcon}
          action={editButton(
            () => setPanel({ kind: 'appointment' }),
            m.job_add_appointment(),
            PlusIcon,
          )}
        >
          <ListCard>
            {data.appointments.map((appointment) => (
              <li key={appointment._id}>
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'appointment', appointment })}
                  className="flex w-full items-center gap-3 pressable px-4 py-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <CalendarBlankIcon className="size-5" />
                  </span>
                  <span className="flex flex-col">
                    <span>
                      {formatMoment(
                        appointment.start,
                        appointment.allDay,
                        today,
                      )}
                    </span>
                    {appointment.label && (
                      <span className="text-sm text-muted-foreground">
                        {appointment.label}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ListCard>
        </Section>
      )}

      <Section title={m.job_money()} icon={WalletIcon}>
        <div className="mx-4 grid stagger grid-cols-3 gap-2">
          <MoneyFigure
            size="sm"
            label={m.job_price()}
            cents={job.priceCents}
            hint={m.hint_price()}
          />
          <MoneyFigure
            size="sm"
            label={m.job_paid()}
            cents={job.paidCents}
            hint={m.hint_paid()}
          />
          <MoneyFigure
            size="sm"
            label={m.job_balance()}
            cents={job.balanceCents}
            hint={m.hint_balance()}
            tone={job.owes && job.balanceCents > 0 ? 'highlight' : 'plain'}
          />
        </div>
        {modules.costs && (
          <p className="flex items-center gap-1 px-4 text-sm text-muted-foreground">
            {m.job_profit()}: {formatMoney(job.paidCents - job.costCents)}
            <Hint term={m.job_profit()}>{m.hint_job_profit()}</Hint>
          </p>
        )}
        {client && client.creditCents > 0 && job.owes && (
          <div className="mx-4 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2">
            <span className="text-sm font-medium">
              {m.credit_banner({ amount: formatMoney(client.creditCents) })}
            </span>
            <Button
              variant="secondary"
              className="h-10"
              onClick={() =>
                void applyCredit({ businessId: business._id, jobId: job._id })
                  .then((cents) =>
                    toast.success(
                      m.credit_used({ amount: formatMoney(cents) }),
                    ),
                  )
                  .catch((error: unknown) => toast.error(errorMessage(error)))
              }
            >
              {m.credit_use()}
            </Button>
          </div>
        )}
        {job.writeOff && (
          <div className="flex items-center justify-between gap-3 px-4 text-sm text-muted-foreground">
            <span>
              {m.job_written_off()}: {formatMoney(job.writeOff.amountCents)} ·{' '}
              {job.writeOff.note}
            </span>
            <Button
              variant="ghost"
              className="h-9 shrink-0"
              onClick={() =>
                void removeWriteOff({
                  businessId: business._id,
                  jobId: job._id,
                }).catch((error: unknown) => toast.error(errorMessage(error)))
              }
            >
              {m.writeoff_undo()}
            </Button>
          </div>
        )}
        {data.payments.length > 0 && (
          <ListCard>
            {data.payments.map((payment) => (
              <li key={payment._id}>
                <button
                  type="button"
                  onClick={() =>
                    setPanel({
                      kind: 'removePayment',
                      paymentId: payment.paymentId,
                      amountCents: payment.paymentAmountCents,
                    })
                  }
                  className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left text-sm"
                >
                  <span>
                    {payment.label ?? METHOD_LABEL[payment.method]()} ·{' '}
                    {formatDay(payment.date, today)}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(payment.amountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ListCard>
        )}
        <div className="flex flex-wrap gap-2 px-4">
          <Button size="xl" onClick={() => setPanel({ kind: 'payment' })}>
            <PlusIcon data-icon="inline-start" />
            {m.pay_add()}
          </Button>
          {job.paidCents > 0 && (
            <Button
              variant="outline"
              size="xl"
              onClick={() => setPanel({ kind: 'refund' })}
            >
              {m.refund_add()}
            </Button>
          )}
          {job.owes && job.paidCents < job.priceCents && (
            <Button
              variant="ghost"
              size="xl"
              onClick={() => setPanel({ kind: 'writeOff' })}
            >
              {m.writeoff_add()}
            </Button>
          )}
        </div>
      </Section>

      <Section
        title={m.job_lines()}
        icon={ListBulletsIcon}
        action={editButton(
          () => setPanel({ kind: 'lines' }),
          job.lines.length ? m.edit() : m.job_add_line(),
          job.lines.length ? PencilSimpleIcon : PlusIcon,
        )}
      >
        {job.lines.length > 0 ? (
          <ListCard>
            {job.lines.map((line) => (
              <li
                key={line.id}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  {line.description}
                  <span className="text-muted-foreground">
                    {' '}
                    · {String(line.quantity).replace('.', ',')} ×{' '}
                    {formatMoney(line.unitPriceCents)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(
                    lineTotalCents(line.quantity, line.unitPriceCents),
                  )}
                </span>
              </li>
            ))}
          </ListCard>
        ) : (
          job.typedPriceCents !== undefined && (
            <p className="px-4 text-sm text-muted-foreground">
              {m.job_typed_price()}: {formatMoney(job.typedPriceCents)}
            </p>
          )
        )}
      </Section>

      {modules.costs && (
        <Section
          title={m.job_costs()}
          icon={ReceiptIcon}
          action={editButton(
            () => setPanel({ kind: 'cost' }),
            m.cost_add(),
            PlusIcon,
          )}
        >
          <ListCard>
            {data.costs.map((cost) => (
              <li key={cost._id}>
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'cost', cost })}
                  className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left text-sm"
                >
                  <span>
                    {cost.label} · {formatDay(cost.date, today)}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(cost.amountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ListCard>
        </Section>
      )}

      {modules.items && client && !client.isNoClient && (
        <Section
          title={words.item.plural}
          icon={StackIcon}
          action={editButton(() => setPanel({ kind: 'items' }))}
        >
          <div className="flex flex-wrap gap-2 px-4">
            {data.items.map((item) => (
              <Link
                key={item._id}
                to="/items/$itemId"
                params={{ itemId: item._id }}
                className={buttonVariants({
                  variant: 'outline',
                  className: 'h-11 rounded-xl shadow-xs',
                })}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <ExtraFieldsView fields={fields} values={job.extra} today={today} />

      {job.notes && (
        <Section title={m.job_notes()} icon={NoteIcon}>
          <p className="mx-4 surface px-4 py-3 text-sm whitespace-pre-wrap">
            {job.notes}
          </p>
        </Section>
      )}

      <RepeatSection job={job} />

      {modules.reminders && client && !client.isNoClient && (
        <div className="px-4">
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setPanel({ kind: 'reminder', rule: false })}
          >
            <BellIcon data-icon="inline-start" />
            {m.reminder_add()}
          </Button>
        </div>
      )}

      <Section title={m.job_files()} icon={PaperclipIcon}>
        <FileGallery
          businessId={business._id}
          target={{ kind: 'job', jobId: job._id }}
        />
      </Section>

      {data.timeline.length > 0 && (
        <Section title={m.job_history()} icon={ClockCounterClockwiseIcon}>
          <Timeline items={data.timeline} />
        </Section>
      )}

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
                  : panel?.kind === 'writeOff'
                    ? m.writeoff_title()
                    : panel?.kind === 'cost'
                      ? m.cost_title()
                      : panel?.kind === 'removePayment'
                        ? m.pay_remove()
                        : panel?.kind === 'reminder'
                          ? panel.rule
                            ? m.reminder_rule_title()
                            : m.reminder_add_title()
                          : panel?.kind === 'lines'
                            ? m.job_lines()
                            : panel?.kind === 'appointment'
                              ? words.appointment.singular
                              : panel?.kind === 'items'
                                ? words.item.plural
                                : job.title}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {panel?.kind === 'edit' && (
              <JobEditForm
                businessId={business._id}
                job={job}
                fields={fields}
                onDone={close}
              />
            )}
            {panel?.kind === 'lines' && (
              <LinesEditor
                businessId={business._id}
                job={job}
                services={services ?? []}
                onDone={close}
              />
            )}
            {panel?.kind === 'appointment' && (
              <AppointmentForm
                businessId={business._id}
                jobId={job._id}
                appointment={panel.appointment}
                today={today}
                onDone={close}
              />
            )}
            {panel?.kind === 'payment' && (
              <PaymentForm
                businessId={business._id}
                target={{
                  kind: 'job',
                  jobId: job._id,
                  balanceCents: job.owes ? job.balanceCents : 0,
                }}
                today={today}
                depositsOn={business.depositsOnNewJob}
                onDone={close}
              />
            )}
            {panel?.kind === 'refund' && client && (
              <RefundForm
                businessId={business._id}
                clientId={client._id}
                job={{ _id: job._id, paidCents: job.paidCents }}
                creditCents={client.creditCents}
                today={today}
                onDone={close}
              />
            )}
            {panel?.kind === 'writeOff' && (
              <WriteOffForm
                businessId={business._id}
                jobId={job._id}
                balanceCents={job.balanceCents}
                onDone={close}
              />
            )}
            {panel?.kind === 'cost' && (
              <CostForm
                businessId={business._id}
                jobId={job._id}
                cost={panel.cost}
                today={today}
                onDone={close}
              />
            )}
            {panel?.kind === 'reminder' && (
              <>
                {panel.rule && business.reminderRule && (
                  <p className="pb-4 text-sm">
                    {m.reminder_rule_body({
                      when: monthsLabel(
                        business.reminderRule.months,
                      ).toLocaleLowerCase('bg'),
                    })}
                  </p>
                )}
                <ReminderForm
                  businessId={business._id}
                  target={{ jobId: job._id, itemId: job.itemIds.at(0) }}
                  initialDate={
                    panel.rule && business.reminderRule
                      ? addMonths(today, business.reminderRule.months)
                      : today
                  }
                  initialNote={panel.rule ? job.title : ''}
                  source={panel.rule ? 'rule' : 'manual'}
                  onDone={close}
                  onSkip={panel.rule ? close : undefined}
                />
              </>
            )}
            {panel?.kind === 'removePayment' && (
              <RemovePayment
                businessId={business._id}
                paymentId={panel.paymentId}
                amountCents={panel.amountCents}
                onDone={close}
              />
            )}
            {panel?.kind === 'items' && client && (
              <ItemsPicker
                businessId={business._id}
                job={job}
                clientId={client._id}
                onDone={close}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ItemsPicker({
  businessId,
  job,
  clientId,
  onDone,
}: {
  businessId: Id<'businesses'>
  job: Doc<'jobs'>
  clientId: Id<'clients'>
  onDone: () => void
}) {
  const items = useQuery(api.items.byClient, { businessId, clientId })
  const setItems = useMutation(api.jobs.setItems)
  const [chosen, setChosen] = useState<Array<Id<'items'>>>(job.itemIds)
  if (!items) return <ListSkeleton />
  const toggle = (itemId: Id<'items'>) =>
    setChosen(
      chosen.includes(itemId)
        ? chosen.filter((id) => id !== itemId)
        : [...chosen, itemId],
    )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Button
            key={item._id}
            variant={chosen.includes(item._id) ? 'secondary' : 'outline'}
            aria-pressed={chosen.includes(item._id)}
            className="h-11 rounded-xl aria-pressed:border-primary"
            onClick={() => toggle(item._id)}
          >
            {item.name}
          </Button>
        ))}
        <Link
          to="/items/new"
          search={{ clientId }}
          className={buttonVariants({
            variant: 'ghost',
            className: 'h-11 rounded-xl',
          })}
        >
          <PlusIcon data-icon="inline-start" />
          {m.item_add()}
        </Link>
      </div>
      <Button
        size="xl"
        onClick={() =>
          void setItems({ businessId, jobId: job._id, itemIds: chosen })
            .then(onDone)
            .catch((error: unknown) => toast.error(errorMessage(error)))
        }
      >
        {m.save()}
      </Button>
    </div>
  )
}
