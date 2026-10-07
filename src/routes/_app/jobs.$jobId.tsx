import {
  CalendarBlankIcon,
  CheckIcon,
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
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AddressLink } from '#/components/address-link'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { AppointmentForm } from '#/components/job/appointment-form'
import { RepeatSection } from '#/components/job/repeat-section'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { RemindersPanel } from '#/components/reminders/reminders-panel'
import { monthsLabel } from '#/components/setup/steps'
import { CostForm } from '#/components/money/cost-form'
import { MoneyFigure } from '#/components/money/money-figure'
import { PaymentForm } from '#/components/money/payment-form'
import { PaymentSheet } from '#/components/money/payment-sheet'
import { RefundForm } from '#/components/money/refund-form'
import { WriteOffForm } from '#/components/money/write-off-form'
import { JobEditForm } from '#/components/job/job-edit-form'
import { JobSummaryButton } from '#/components/job-summary-sheet'
import { LinesEditor } from '#/components/job/lines-editor'
import { Columns } from '#/components/columns'
import { Hint } from '#/components/hint'
import { InitialsAvatar } from '#/components/initials-avatar'
import { formatMoment } from '#/components/job-row'
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
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useToday } from '#/hooks/use-today'
import { useMoveJob } from '#/hooks/use-move-job'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { jobProfitCents, jobProfitIsFinal } from '../../../shared/allocation'
import { addMonths, isOverdue } from '../../../shared/dates'
import { formatMoney, lineTotalCents } from '../../../shared/money'
import { defaultPaymentMethod } from '../../../shared/payment-method'
import { telHref } from '../../../shared/phone-format'
import type { StageGroup } from '../../../shared/stages'

export const Route = createFileRoute('/_app/jobs/$jobId')({
  staticData: { layout: 'wide' },
  component: JobPage,
})

type OpenSheet =
  | { kind: 'edit' }
  | { kind: 'lines' }
  | { kind: 'appointment'; appointment?: Doc<'appointments'> }
  | { kind: 'items' }
  | { kind: 'payment' }
  | { kind: 'refund' }
  | { kind: 'writeOff' }
  | { kind: 'cost'; cost?: Doc<'costs'> }
  | { kind: 'reminder'; rule: boolean }

type StageRef = { _id: Id<'stages'>; name: string; group: StageGroup }

/** One toast at a time for stage changes: a new one replaces the last. */
const STAGE_TOAST = 'stage-moved'

// The current stage is the one filled chip; colour follows its group (D53).
const CURRENT_STAGE: Record<StageGroup, string> = {
  new: 'bg-primary text-primary-foreground',
  in_progress: 'bg-primary text-primary-foreground',
  done: 'bg-green-600 text-white',
  cancelled: 'bg-destructive text-white',
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
  const reminders = useQuery(
    api.reminders.forJob,
    business.modules.reminders
      ? { businessId: business._id, jobId: jobId as Id<'jobs'> }
      : 'skip',
  )
  const move = useMoveJob()
  const applyCredit = useMutation(api.payments.useCredit)
  const removeWriteOff = useMutation(api.jobs.removeWriteOff)
  const [panel, setPanel] = useState<OpenSheet | null>(null)
  // The stage toast waits here while the reminder offer is open (see moveTo).
  const afterSheet = useRef<(() => void) | null>(null)
  const [openPayment, setOpenPayment] = useState<Id<'payments'> | null>(null)
  const { words, modules } = business

  // A toast's undo and payment buttons belong to this job's page.
  useEffect(() => () => void toast.dismiss(STAGE_TOAST), [jobId])

  if (!data || !fields) return <ListSkeleton />
  const { job, client } = data
  const phone = client?.phones.at(0)?.e164
  // New and in-progress work can still be paid or cost more: profit so far.
  const profitLabel = jobProfitIsFinal(job.stageGroup)
    ? m.job_profit()
    : m.job_profit_so_far()
  const late =
    (job.stageGroup === 'new' || job.stageGroup === 'in_progress') &&
    isOverdue(job.dueDate, today)

  // Tells the person which stage the job is in now, with a way back. Reaching
  // Done with a balance also offers the payment.
  const announceMove = (target: StageRef, previous: StageRef | undefined) => {
    const undo = previous
      ? {
          label: m.undo(),
          onClick: () =>
            void move(
              {
                _id: job._id,
                stageGroup: target.group,
                isNoClient: client?.isNoClient ?? false,
              },
              previous,
            ),
        }
      : undefined
    const offerPayment =
      target.group === 'done' &&
      job.stageGroup !== 'done' &&
      job.balanceCents > 0
    toast.success(m.job_stage_moved({ stage: target.name }), {
      id: STAGE_TOAST,
      duration: offerPayment ? 10_000 : 6000,
      ...(offerPayment
        ? {
            action: {
              label: m.pay_add(),
              onClick: () => setPanel({ kind: 'payment' }),
            },
            cancel: undo,
          }
        : { action: undo }),
    })
  }
  const moveTo = (stageId: Id<'stages'>) => {
    const target = data.stages.find((stage) => stage._id === stageId)
    const previous = data.stages.find((stage) => stage._id === job.stageId)
    if (!target) return
    const moving = {
      _id: job._id,
      stageGroup: job.stageGroup,
      isNoClient: client?.isNoClient ?? false,
    }
    void move(moving, target, (offerRule) => {
      // Q5: reaching Done offers the reminder rule's reminder, pre-filled. Its
      // sheet covers the page, so the toast comes once the sheet is closed.
      if (offerRule) {
        afterSheet.current = () => announceMove(target, previous)
        setPanel({ kind: 'reminder', rule: true })
      } else {
        announceMove(target, previous)
      }
    })
  }
  const close = () => {
    setPanel(null)
    afterSheet.current?.()
    afterSheet.current = null
  }
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
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex items-start justify-between gap-3 px-4 pt-2">
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
      </header>

      {/* A wide screen puts the work and its money on the left, and the
          dates, files and history on the right. */}
      <Columns
        layout="main-side"
        slots={[
          {
            key: 'info',
            node: (client || job.address || job.dueDate) && (
              <div className="mx-4 flex animate-rise flex-col divide-y divide-border/70 overflow-hidden surface">
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
                            variant: 'ghost',
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
                    <AddressLink address={job.address} />
                  </InfoRow>
                )}
                {job.dueDate && (
                  <InfoRow
                    icon={late ? WarningCircleIcon : FlagIcon}
                    className={
                      late
                        ? 'font-medium text-destructive'
                        : 'text-muted-foreground'
                    }
                  >
                    {late
                      ? m.late_since({ date: formatDay(job.dueDate, today) })
                      : m.due_short({ date: formatDay(job.dueDate, today) })}
                  </InfoRow>
                )}
              </div>
            ),
          },
          {
            key: 'stage',
            node: (
              <Panel
                title={m.job_stage()}
                icon={FlowArrowIcon}
                hint={<Hint term={m.job_stage()}>{m.hint_stage()}</Hint>}
              >
                <PanelBody>
                  <div
                    className="flex flex-wrap gap-2"
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
                          onClick={() => !current && moveTo(stage._id)}
                          className={cn(
                            'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-[background-color,color,transform] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95',
                            current
                              ? cn('shadow-sm', CURRENT_STAGE[stage.group])
                              : cn(
                                  'bg-card ring-1 ring-border ring-inset hover:bg-muted',
                                  stage.group === 'cancelled'
                                    ? 'text-destructive'
                                    : 'text-foreground/80',
                                ),
                          )}
                        >
                          {current && (
                            <CheckIcon
                              aria-hidden
                              className="size-4"
                              weight="bold"
                            />
                          )}
                          {stage.name}
                        </button>
                      )
                    })}
                  </div>
                  {job.cancelReason && job.stageGroup === 'cancelled' && (
                    <p className="pt-3 text-sm text-muted-foreground">
                      {m.job_cancel_reason()}: {job.cancelReason}
                    </p>
                  )}
                </PanelBody>
              </Panel>
            ),
          },
          {
            key: 'appointments',
            side: true,
            node: modules.appointments && (
              <Panel
                title={words.appointment.plural}
                icon={CalendarBlankIcon}
                action={editButton(
                  () => setPanel({ kind: 'appointment' }),
                  m.job_add_appointment(),
                  PlusIcon,
                )}
              >
                <PanelList>
                  {data.appointments.map((appointment) => (
                    <li key={appointment._id}>
                      <button
                        type="button"
                        onClick={() =>
                          setPanel({ kind: 'appointment', appointment })
                        }
                        className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-3 text-left"
                      >
                        <span className="font-medium">
                          {formatMoment(
                            appointment.start,
                            appointment.allDay,
                            today,
                          )}
                        </span>
                        {appointment.label && (
                          <span className="truncate text-sm text-muted-foreground">
                            {appointment.label}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </PanelList>
              </Panel>
            ),
          },
          {
            key: 'money',
            node: (
              <Panel
                title={m.job_money()}
                icon={WalletIcon}
                footer={
                  <>
                    <Button
                      size="xl"
                      onClick={() => setPanel({ kind: 'payment' })}
                    >
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
                  </>
                }
              >
                <div className="grid grid-cols-3 divide-x divide-border/70 border-t border-border/70">
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
                    emphasis={
                      job.owes && job.balanceCents > 0 ? 'primary' : undefined
                    }
                  />
                </div>
                {modules.costs && (
                  <>
                    <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {m.job_costs()}
                        <Hint term={m.job_costs()}>{m.hint_job_costs()}</Hint>
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(job.costCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {profitLabel}
                        <Hint term={profitLabel}>
                          {jobProfitIsFinal(job.stageGroup)
                            ? m.hint_job_profit()
                            : m.hint_job_profit_so_far()}
                        </Hint>
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(jobProfitCents(job))}
                      </span>
                    </div>
                  </>
                )}
                {client && client.creditCents > 0 && job.owes && (
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-primary/5 py-2 pr-2 pl-4">
                    <span className="text-sm font-medium">
                      {m.credit_banner({
                        amount: formatMoney(client.creditCents),
                      })}
                    </span>
                    <Button
                      variant="outline"
                      className="h-10 border-primary bg-background text-primary hover:bg-primary/10 dark:bg-background dark:hover:bg-primary/15"
                      onClick={() =>
                        void applyCredit({
                          businessId: business._id,
                          jobId: job._id,
                        })
                          .then((cents) =>
                            toast.success(
                              m.credit_used({ amount: formatMoney(cents) }),
                            ),
                          )
                          .catch((error: unknown) =>
                            toast.error(errorMessage(error)),
                          )
                      }
                    >
                      {m.credit_use()}
                    </Button>
                  </div>
                )}
                {job.writeOff && (
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 py-1.5 pr-2 pl-4 text-sm text-muted-foreground">
                    <span>
                      {m.job_written_off()}:{' '}
                      {formatMoney(job.writeOff.amountCents)} ·{' '}
                      {job.writeOff.note}
                    </span>
                    <Button
                      variant="ghost"
                      className="h-9 shrink-0"
                      onClick={() =>
                        void removeWriteOff({
                          businessId: business._id,
                          jobId: job._id,
                        }).catch((error: unknown) =>
                          toast.error(errorMessage(error)),
                        )
                      }
                    >
                      {m.writeoff_undo()}
                    </Button>
                  </div>
                )}
                <PanelList>
                  {data.payments.map((payment) => {
                    // Money paid beyond what the job owed stays with the client.
                    const rest =
                      payment.paymentAmountCents - payment.paymentAllocatedCents
                    return (
                      <li key={payment._id}>
                        <button
                          type="button"
                          onClick={() => setOpenPayment(payment.paymentId)}
                          className="flex w-full flex-col gap-0.5 pressable px-4 py-2.5 text-left text-sm"
                        >
                          <span className="flex w-full items-baseline justify-between gap-3">
                            <span>
                              {payment.label ?? METHOD_LABEL[payment.method]()}{' '}
                              ·{' '}
                              <span className="text-muted-foreground">
                                {formatDay(payment.date, today)}
                              </span>
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatMoney(payment.amountCents)}
                            </span>
                          </span>
                          {payment.paymentAmountCents > 0 && rest > 0 && (
                            <span className="text-muted-foreground">
                              {m.job_payment_rest({
                                amount: formatMoney(rest),
                              })}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </PanelList>
              </Panel>
            ),
          },
          {
            key: 'lines',
            node: (
              <Panel
                title={m.job_lines()}
                icon={ListBulletsIcon}
                action={editButton(
                  () => setPanel({ kind: 'lines' }),
                  job.lines.length ? m.edit() : m.job_add_line(),
                  job.lines.length ? PencilSimpleIcon : PlusIcon,
                )}
              >
                {job.lines.length > 0 ? (
                  <PanelList>
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
                  </PanelList>
                ) : (
                  job.typedPriceCents !== undefined && (
                    <PanelBody className="py-3 text-sm text-muted-foreground">
                      {m.job_typed_price()}: {formatMoney(job.typedPriceCents)}
                    </PanelBody>
                  )
                )}
              </Panel>
            ),
          },
          {
            key: 'costs',
            node: modules.costs && (
              <Panel
                title={m.job_costs()}
                icon={ReceiptIcon}
                action={editButton(
                  () => setPanel({ kind: 'cost' }),
                  m.cost_add(),
                  PlusIcon,
                )}
              >
                <PanelList>
                  {data.costs.map((cost) => (
                    <li key={cost._id}>
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: 'cost', cost })}
                        className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left text-sm"
                      >
                        <span>
                          {cost.label} ·{' '}
                          <span className="text-muted-foreground">
                            {formatDay(cost.date, today)}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(cost.amountCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </PanelList>
              </Panel>
            ),
          },
          {
            key: 'items',
            side: true,
            node: modules.items && client && !client.isNoClient && (
              <Panel
                title={words.item.plural}
                icon={StackIcon}
                action={editButton(() => setPanel({ kind: 'items' }))}
              >
                {data.items.length > 0 && (
                  <PanelBody className="flex flex-wrap gap-2">
                    {data.items.map((item) => (
                      <Link
                        key={item._id}
                        to="/items/$itemId"
                        params={{ itemId: item._id }}
                        className={cn(
                          buttonVariants({
                            variant: 'outline',
                            className: 'h-11 rounded-xl',
                          }),
                        )}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </PanelBody>
                )}
              </Panel>
            ),
          },
          {
            key: 'extra',
            node: (
              <ExtraFieldsView
                fields={fields}
                values={job.extra}
                today={today}
              />
            ),
          },
          {
            key: 'notes',
            node: job.notes && (
              <Panel title={m.job_notes()} icon={NoteIcon}>
                <PanelBody className="text-sm whitespace-pre-wrap">
                  {job.notes}
                </PanelBody>
              </Panel>
            ),
          },
          {
            key: 'repeat',
            side: true,
            node: <RepeatSection job={job} appointments={data.appointments} />,
          },
          {
            key: 'reminders',
            side: true,
            node: modules.reminders && client && !client.isNoClient && (
              <RemindersPanel
                reminders={reminders ?? []}
                today={today}
                onAdd={() => setPanel({ kind: 'reminder', rule: false })}
              />
            ),
          },
          {
            key: 'files',
            side: true,
            node: (
              <Panel title={m.job_files()} icon={PaperclipIcon}>
                <PanelBody className="px-0">
                  <FileGallery
                    businessId={business._id}
                    target={{ kind: 'job', jobId: job._id }}
                  />
                </PanelBody>
              </Panel>
            ),
          },
          {
            key: 'history',
            side: true,
            node: data.timeline.length > 0 && (
              <Panel title={m.job_history()} icon={ClockCounterClockwiseIcon}>
                <PanelBody className="px-0">
                  <Timeline items={data.timeline} />
                </PanelBody>
              </Panel>
            ),
          },
        ]}
      />

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
                defaultMethod={defaultPaymentMethod(
                  data.payments.map((payment) => ({
                    amountCents: payment.paymentAmountCents,
                    method: payment.method,
                  })),
                )}
                onDone={close}
              />
            )}
            {panel?.kind === 'refund' && client && (
              <RefundForm
                businessId={business._id}
                clientId={client._id}
                sources={[
                  {
                    jobId: job._id,
                    title: job.title,
                    limitCents: job.paidCents,
                  },
                ]}
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
      <PaymentSheet
        businessId={business._id}
        paymentId={openPayment}
        today={today}
        onClose={() => setOpenPayment(null)}
      />
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
  const { business } = useViewer()
  const items = useQuery(api.items.byClient, { businessId, clientId })
  const setItems = useMutation(api.jobs.setItems)
  const [chosen, setChosen] = useState<Array<Id<'items'>>>(job.itemIds)
  if (!items) return <ListSkeleton />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          multiple
          aria-label={business.words.item.plural}
          value={chosen}
          onValueChange={(next: string[]) =>
            setChosen(next as Array<Id<'items'>>)
          }
          variant="outline"
          size="xl"
          className="flex-wrap"
        >
          {items.map((item) => (
            <ToggleGroupItem key={item._id} value={item._id}>
              {item.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* The new item comes back to this job, linked to it. */}
        <Link
          to="/items/new"
          search={{ clientId, jobId: job._id }}
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
