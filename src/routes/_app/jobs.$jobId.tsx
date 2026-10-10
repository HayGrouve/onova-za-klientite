import {
  CalendarBlankIcon,
  ClockCounterClockwiseIcon,
  DotsThreeIcon,
  FlagIcon,
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
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '#/components/confirm-action'
import { ListExtras } from '#/components/list-extras'
import { AddressLink } from '#/components/address-link'
import { ExtraFieldsView } from '#/components/extra-fields'
import { FileGallery } from '#/components/files/file-gallery'
import { AppointmentForm } from '#/components/job/appointment-form'
import { StagePicker } from '#/components/job/stage-picker'
import { RepeatSection } from '#/components/job/repeat-section'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { RemindersPanel } from '#/components/reminders/reminders-panel'
import { RuleReminderSheet } from '#/components/reminders/rule-reminder-sheet'
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
import { MoreSection } from '#/components/more-section'
import { DetailError } from '#/components/not-found'
import { Panel, PanelBody, PanelList } from '#/components/panel'
import { Tip } from '#/components/tip'
import { Timeline } from '#/components/timeline'
import { Button, buttonVariants } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { DetailSheet, useDetailSheet } from '#/components/detail-sheet'
import { usePageTitle } from '#/hooks/use-page-title'
import { useToday } from '#/hooks/use-today'
import { STAGE_TOAST, useMoveJob } from '#/hooks/use-move-job'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { runChange } from '#/lib/change'
import { m } from '#/paraglide/messages.js'
import {
  creditForJob,
  jobOwedCents,
  jobProfitCents,
  jobProfitIsFinal,
  refundSources,
} from '../../../shared/allocation'
import { dateInSofia } from '../../../shared/dates'
import { formatMoney, lineTotalCents } from '../../../shared/money'
import { formatQuantity } from '../../../shared/quantity'
import { defaultPaymentMethod } from '../../../shared/payment-method'
import { telHref } from '../../../shared/phone-format'
import { hasRole } from '../../../shared/roles'
import { isJobLate } from '../../../shared/stages'
import type { MorePart } from '../../../shared/more-summary'

export const Route = createFileRoute('/_app/jobs/$jobId')({
  staticData: { layout: 'wide' },
  component: JobPage,
  // A wrong address, or a record from another business, says so (D16).
  errorComponent: ({ error }) => <DetailError error={error} kind="job" />,
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
  | { kind: 'reminder' }

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
    jobId,
  })
  usePageTitle(data?.job.title)
  const services = useQuery(api.services.list, { businessId: business._id })
  const { moveAndAnnounce, ruleOffer, closeRuleOffer } = useMoveJob()
  const applyCredit = useMutation(api.payments.useCredit)
  const removeWriteOff = useMutation(api.jobs.removeWriteOff)
  // The edit, lines, appointment and cost forms ask before dropping what was typed.
  const sheet = useDetailSheet<OpenSheet>()
  const [openPayment, setOpenPayment] = useState<Id<'payments'> | null>(null)
  const [usingCredit, setUsingCredit] = useState(false)
  const [undoingWriteOff, setUndoingWriteOff] = useState(false)
  const { words, modules } = business

  // A toast's undo and payment buttons belong to this job's page.
  useEffect(() => () => void toast.dismiss(STAGE_TOAST), [jobId])

  if (!data) return <ListSkeleton />
  const { job, client } = data
  const phone = client?.phones.at(0)?.e164
  // New and in-progress work can still be paid or cost more: profit so far.
  const profitLabel = jobProfitIsFinal(job.stageGroup)
    ? m.job_profit()
    : m.job_profit_so_far()
  const late = isJobLate(job, today)
  // Workers see the stage; moving a job is for managers, as on the board.
  const canMove = hasRole(business.role, 'manager')
  const nextVisit = modules.appointments
    ? data.appointments.find(
        (appointment) => dateInSofia(appointment.start) >= today,
      )
    : undefined
  const canRefund = job.paidCents > 0
  const canWriteOff = jobOwedCents(job) > 0 && job.paidCents < job.priceCents
  // The folded parts, by name, with how many each holds.
  const moreSummary: MorePart[] = [
    ...(modules.appointments
      ? [{ name: words.appointment.plural, count: data.appointments.length }]
      : []),
    { name: m.job_lines(), count: job.lines.length },
    ...(modules.costs
      ? [{ name: m.job_costs(), count: data.costs.length }]
      : []),
    ...(modules.items && client && !client.isNoClient
      ? [{ name: words.item.plural, count: data.items.length }]
      : []),
    { name: m.repeat_title() },
    ...(modules.reminders && client && !client.isNoClient
      ? [{ name: m.reminder_list(), count: data.reminders.length }]
      : []),
    { name: m.job_files() },
    { name: m.job_history(), count: data.timeline.length },
  ]

  const moveTo = async (stageId: Id<'stages'>) => {
    const target = data.stages.find((stage) => stage._id === stageId)
    const previous = data.stages.find((stage) => stage._id === job.stageId)
    if (!target) return
    await moveAndAnnounce(
      {
        _id: job._id,
        title: job.title,
        stageGroup: job.stageGroup,
        isNoClient: client?.isNoClient ?? false,
        balanceCents: job.balanceCents,
        itemId: job.itemIds.at(0),
      },
      target,
      previous,
      () => sheet.open({ kind: 'payment' }),
    )
  }
  const spendCredit = async () => {
    setUsingCredit(true)
    const used = await runChange(() =>
      applyCredit({ businessId: business._id, jobId: job._id }),
    )
    if (used.done) {
      toast.success(m.credit_used({ amount: formatMoney(used.value) }))
    }
    setUsingCredit(false)
  }
  const undoWriteOff = async () => {
    setUndoingWriteOff(true)
    await runChange(() =>
      removeWriteOff({ businessId: business._id, jobId: job._id }),
    )
    setUndoingWriteOff(false)
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
        <h1 className="min-w-0 text-2xl leading-tight font-semibold tracking-tight text-balance break-words">
          {job.title}
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          <JobSummaryButton businessId={business._id} jobId={job._id} />
          <Tip label={m.job_edit()}>
            <Button
              variant="ghost"
              size="icon-xl"
              aria-label={m.job_edit()}
              onClick={() => sheet.open({ kind: 'edit' })}
            >
              <PencilSimpleIcon />
            </Button>
          </Tip>
        </div>
      </header>

      {/* The page opens on who, where and when, the stage and the money:
          the few things done on every visit. Everything else is folded
          under "More". A wide screen keeps the fold in the right rail. */}
      <Columns
        layout="main-side"
        slots={[
          {
            key: 'info',
            node: (client || job.address || job.dueDate || nextVisit) && (
              <div className="mx-4 flex flex-col divide-y divide-border/70 overflow-hidden surface">
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
                {/* The next visit stays in view while the list of them is folded. */}
                {nextVisit && (
                  <button
                    type="button"
                    onClick={() =>
                      sheet.open({
                        kind: 'appointment',
                        appointment: nextVisit,
                      })
                    }
                    className="flex min-h-11 w-full items-center gap-3 pressable px-4 py-2 text-left text-sm"
                  >
                    <CalendarBlankIcon
                      aria-hidden
                      className="size-5 shrink-0 opacity-80"
                    />
                    <span className="min-w-0 break-words">
                      <span className="font-medium">
                        {formatMoment(nextVisit.start, nextVisit.allDay, today)}
                      </span>
                      {nextVisit.label && (
                        <span className="text-muted-foreground">
                          {' '}
                          · {nextVisit.label}
                        </span>
                      )}
                    </span>
                  </button>
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
              <StagePicker
                stages={data.stages}
                currentId={job.stageId}
                jobTitle={job.title}
                onMove={(stageId) => void moveTo(stageId)}
                readOnly={!canMove}
              >
                {job.cancelReason && job.stageGroup === 'cancelled' && (
                  <p className="text-sm break-words text-muted-foreground">
                    {m.job_cancel_reason()}: {job.cancelReason}
                  </p>
                )}
              </StagePicker>
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
                    {/* Solid only while something is owed; "Next" stays the one
                        main action otherwise. A wide screen doesn't stretch it. */}
                    <Button
                      size="xl"
                      variant={jobOwedCents(job) > 0 ? 'default' : 'secondary'}
                      className="flex-1 lg:max-w-60"
                      onClick={() => sheet.open({ kind: 'payment' })}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {m.pay_add()}
                    </Button>
                    {/* Refunds and write-offs are rare: one menu holds them. */}
                    {(canRefund || canWriteOff) && (
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
                          {canRefund && (
                            <DropdownMenuItem
                              className="min-h-11"
                              onClick={() => sheet.open({ kind: 'refund' })}
                            >
                              {m.refund_add()}
                            </DropdownMenuItem>
                          )}
                          {canWriteOff && (
                            <DropdownMenuItem
                              className="min-h-11"
                              variant="destructive"
                              onClick={() => sheet.open({ kind: 'writeOff' })}
                            >
                              {m.writeoff_add()}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                    emphasis={jobOwedCents(job) > 0 ? 'primary' : undefined}
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
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-primary/5 py-2 pr-2 pl-4">
                    <span className="min-w-0 flex-1 basis-40 text-sm font-medium">
                      {m.credit_banner({
                        amount: formatMoney(client.creditCents),
                      })}
                    </span>
                    {/* Nothing reverses it in one step, so it asks first. */}
                    <div className="max-w-full">
                      <ConfirmAction
                        label={m.credit_use()}
                        question={m.credit_use_question({
                          amount: formatMoney(
                            creditForJob(client.creditCents, job),
                          ),
                        })}
                        confirmLabel={m.credit_use()}
                        variant="outline"
                        busy={usingCredit}
                        className="h-10 border-primary bg-background text-primary hover:bg-primary/10 dark:bg-background dark:hover:bg-primary/15"
                        onConfirm={() => void spendCredit()}
                      />
                    </div>
                  </div>
                )}
                {job.writeOff && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/70 py-1.5 pr-2 pl-4 text-sm text-muted-foreground">
                    <span className="min-w-0 flex-1 basis-40 break-words">
                      {m.job_written_off()}:{' '}
                      {formatMoney(job.writeOff.amountCents)} ·{' '}
                      {job.writeOff.note}
                    </span>
                    {/* The note goes with it, so it asks first. */}
                    <div className="max-w-full py-1">
                      <ConfirmAction
                        label={m.writeoff_undo()}
                        question={m.writeoff_undo_question({
                          amount: formatMoney(job.writeOff.amountCents),
                        })}
                        confirmLabel={m.writeoff_undo()}
                        variant="ghost"
                        busy={undoingWriteOff}
                        className="h-9"
                        onConfirm={() => void undoWriteOff()}
                      />
                    </div>
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
                            <span className="min-w-0 break-words">
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
            key: 'extra',
            node: (
              <ExtraFieldsView
                fields={data.fields}
                values={job.extra}
                today={today}
              />
            ),
          },
          {
            key: 'notes',
            node: job.notes && (
              <Panel title={m.job_notes()} icon={NoteIcon}>
                <PanelBody className="text-sm break-words whitespace-pre-wrap">
                  {job.notes}
                </PanelBody>
              </Panel>
            ),
          },
          {
            key: 'more',
            side: true,
            node: (
              <MoreSection page="job" summary={moreSummary}>
                {modules.appointments && (
                  <Panel
                    title={words.appointment.plural}
                    icon={CalendarBlankIcon}
                    count={data.appointments.length || undefined}
                    action={editButton(
                      () => sheet.open({ kind: 'appointment' }),
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
                              sheet.open({ kind: 'appointment', appointment })
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
                              <span className="min-w-0 truncate text-sm text-muted-foreground">
                                {appointment.label}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </PanelList>
                  </Panel>
                )}
                <Panel
                  title={m.job_lines()}
                  icon={ListBulletsIcon}
                  action={editButton(
                    () => sheet.open({ kind: 'lines' }),
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
                          <span className="min-w-0 break-words">
                            {line.description}
                            <span className="text-muted-foreground">
                              {' '}
                              · {formatQuantity(line.quantity)} ×{' '}
                              {formatMoney(line.unitPriceCents)}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatMoney(
                              lineTotalCents(
                                line.quantity,
                                line.unitPriceCents,
                              ),
                            )}
                          </span>
                        </li>
                      ))}
                    </PanelList>
                  ) : (
                    job.typedPriceCents !== undefined && (
                      <PanelBody className="py-3 text-sm text-muted-foreground">
                        {m.job_typed_price()}:{' '}
                        {formatMoney(job.typedPriceCents)}
                      </PanelBody>
                    )
                  )}
                </Panel>

                {modules.costs && (
                  <Panel
                    title={m.job_costs()}
                    icon={ReceiptIcon}
                    action={editButton(
                      () => sheet.open({ kind: 'cost' }),
                      m.cost_add(),
                      PlusIcon,
                    )}
                  >
                    <PanelList>
                      {data.costs.map((cost) => (
                        <li key={cost._id}>
                          <button
                            type="button"
                            onClick={() => sheet.open({ kind: 'cost', cost })}
                            className="flex w-full items-baseline justify-between gap-3 pressable px-4 py-2.5 text-left text-sm"
                          >
                            <span className="min-w-0 break-words">
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
                )}
                {modules.items && client && !client.isNoClient && (
                  <Panel
                    title={words.item.plural}
                    icon={StackIcon}
                    action={editButton(() => sheet.open({ kind: 'items' }))}
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
                                className:
                                  'h-auto min-h-11 flex-col items-start gap-0 rounded-xl py-1.5 whitespace-normal',
                              }),
                            )}
                          >
                            {item.name}
                            <ListExtras
                              target="item"
                              values={item.listExtra}
                              className="text-xs font-normal"
                            />
                          </Link>
                        ))}
                      </PanelBody>
                    )}
                  </Panel>
                )}
                {<RepeatSection job={job} appointments={data.appointments} />}
                {modules.reminders && client && !client.isNoClient && (
                  <RemindersPanel
                    reminders={data.reminders}
                    on="job"
                    today={today}
                    onAdd={() => sheet.open({ kind: 'reminder' })}
                  />
                )}
                <Panel title={m.job_files()} icon={PaperclipIcon}>
                  <PanelBody className="px-0">
                    <FileGallery
                      businessId={business._id}
                      target={{ kind: 'job', jobId: job._id }}
                    />
                  </PanelBody>
                </Panel>

                {data.timeline.length > 0 && (
                  <Panel
                    title={m.job_history()}
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
          sheet.panel
            ? {
                edit: m.job_edit_title(),
                lines: m.job_lines(),
                appointment: words.appointment.singular,
                items: words.item.plural,
                payment: m.pay_title(),
                refund: m.refund_title(),
                writeOff: m.writeoff_title(),
                cost: m.cost_title(),
                reminder: m.reminder_add_title(),
              }[sheet.panel.kind]
            : null
        }
      >
        {sheet.panel?.kind === 'edit' && (
          <JobEditForm
            businessId={business._id}
            job={job}
            fields={data.fields}
            onDone={sheet.close}
            onDirtyChange={sheet.setDirty}
          />
        )}
        {sheet.panel?.kind === 'lines' && (
          <LinesEditor
            businessId={business._id}
            job={job}
            services={services ?? []}
            onDone={sheet.close}
            onDirtyChange={sheet.setDirty}
          />
        )}
        {sheet.panel?.kind === 'appointment' && (
          <AppointmentForm
            businessId={business._id}
            jobId={job._id}
            appointment={sheet.panel.appointment}
            today={today}
            onDone={sheet.close}
            onDirtyChange={sheet.setDirty}
          />
        )}
        {sheet.panel?.kind === 'payment' && (
          <PaymentForm
            businessId={business._id}
            target={{
              kind: 'job',
              jobId: job._id,
              balanceCents: jobOwedCents(job),
            }}
            today={today}
            depositsOn={business.depositsOnNewJob}
            defaultMethod={defaultPaymentMethod(
              data.payments.map((payment) => ({
                amountCents: payment.paymentAmountCents,
                method: payment.method,
              })),
            )}
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'refund' && client && (
          <RefundForm
            businessId={business._id}
            clientId={client._id}
            sources={refundSources(0, [job])}
            today={today}
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'writeOff' && (
          <WriteOffForm
            businessId={business._id}
            jobId={job._id}
            balanceCents={job.balanceCents}
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'cost' && (
          <CostForm
            businessId={business._id}
            jobId={job._id}
            cost={sheet.panel.cost}
            today={today}
            onDone={sheet.close}
            onDirtyChange={sheet.setDirty}
          />
        )}
        {sheet.panel?.kind === 'reminder' && (
          <ReminderForm
            businessId={business._id}
            target={{ jobId: job._id, itemId: job.itemIds.at(0) }}
            initialDate={today}
            onDone={sheet.close}
          />
        )}
        {sheet.panel?.kind === 'items' && client && (
          <ItemsPicker
            businessId={business._id}
            job={job}
            clientId={client._id}
            onDone={sheet.close}
          />
        )}
      </DetailSheet>
      <RuleReminderSheet job={ruleOffer} onClose={closeRuleOffer} />
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
          void runChange(() =>
            setItems({ businessId, jobId: job._id, itemIds: chosen }),
          ).then((saved) => saved.done && onDone())
        }
      >
        {m.save()}
      </Button>
    </div>
  )
}
