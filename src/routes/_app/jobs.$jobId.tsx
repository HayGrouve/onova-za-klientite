import {
  CalendarBlankIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
} from '@phosphor-icons/react'
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
import { JobEditForm } from '#/components/job/job-edit-form'
import { LinesEditor } from '#/components/job/lines-editor'
import { formatMoment } from '#/components/job-row'
import { ListSkeleton } from '#/components/list-skeleton'
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
import { isOverdue } from '../../../shared/dates'
import { formatMoney, lineTotalCents } from '../../../shared/money'
import { telHref } from '../../../shared/phone'

export const Route = createFileRoute('/_app/jobs/$jobId')({
  component: JobPage,
})

type Panel =
  | { kind: 'edit' }
  | { kind: 'lines' }
  | { kind: 'appointment'; appointment?: Doc<'appointments'> }
  | { kind: 'items' }

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2 px-4">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
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
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  const close = () => setPanel(null)
  const editButton = (onClick: () => void, label = m.edit()) => (
    <Button variant="ghost" className="h-9" onClick={onClick}>
      {label}
    </Button>
  )

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex flex-col gap-2 px-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {job.title}
          </h1>
          <Button
            variant="ghost"
            size="icon-xl"
            aria-label={m.job_edit()}
            onClick={() => setPanel({ kind: 'edit' })}
          >
            <PencilSimpleIcon />
          </Button>
        </div>
        {client && (
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/clients/$clientId"
              params={{ clientId: client._id }}
              className="min-w-0 truncate text-base font-medium text-primary underline-offset-4 hover:underline"
            >
              {client.isNoClient ? m.no_client() : client.name}
            </Link>
            {phone && (
              <a
                href={telHref(phone)}
                aria-label={m.client_call()}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'icon-xl',
                })}
              >
                <PhoneIcon />
              </a>
            )}
          </div>
        )}
        {job.address && (
          <p className="text-sm text-muted-foreground">{job.address}</p>
        )}
        {job.dueDate && (
          <p
            className={cn(
              'text-sm',
              late ? 'font-medium text-destructive' : 'text-muted-foreground',
            )}
          >
            {late
              ? m.late_since({ date: formatDay(job.dueDate, today) })
              : m.due_short({ date: formatDay(job.dueDate, today) })}
          </p>
        )}
      </header>

      <Section title={m.job_stage()}>
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
                  'rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  current
                    ? 'ring-2 ring-primary ring-offset-2'
                    : 'opacity-70 hover:opacity-100',
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
          action={editButton(
            () => setPanel({ kind: 'appointment' }),
            m.job_add_appointment(),
          )}
        >
          <ul className="flex flex-col">
            {data.appointments.map((appointment) => (
              <li key={appointment._id}>
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'appointment', appointment })}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left hover:bg-muted/60"
                >
                  <CalendarBlankIcon className="size-5 shrink-0 text-primary" />
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
          </ul>
        </Section>
      )}

      <Section title={m.job_money()}>
        <div className="mx-4 grid grid-cols-3 gap-2">
          {[
            { label: m.job_price(), value: job.priceCents },
            { label: m.job_paid(), value: job.paidCents },
            { label: m.job_balance(), value: job.balanceCents },
          ].map((cell) => (
            <div key={cell.label} className="rounded-2xl bg-muted p-3">
              <div className="text-xs text-muted-foreground">{cell.label}</div>
              <div className="font-semibold tabular-nums">
                {formatMoney(cell.value)}
              </div>
            </div>
          ))}
        </div>
        {job.writeOff && (
          <p className="px-4 text-sm text-muted-foreground">
            {m.job_written_off()}: {formatMoney(job.writeOff.amountCents)} ·{' '}
            {job.writeOff.note}
          </p>
        )}
        {data.payments.length > 0 && (
          <ul className="flex flex-col px-4">
            {data.payments.map((payment) => (
              <li
                key={payment._id}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <span>
                  {payment.label ?? METHOD_LABEL[payment.method]()} ·{' '}
                  {formatDay(payment.date, today)}
                </span>
                <span className="tabular-nums">
                  {formatMoney(payment.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={m.job_lines()}
        action={editButton(
          () => setPanel({ kind: 'lines' }),
          job.lines.length ? m.edit() : m.job_add_line(),
        )}
      >
        {job.lines.length > 0 ? (
          <ul className="flex flex-col px-4">
            {job.lines.map((line) => (
              <li
                key={line.id}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
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
          </ul>
        ) : (
          job.typedPriceCents !== undefined && (
            <p className="px-4 text-sm text-muted-foreground">
              {m.job_typed_price()}: {formatMoney(job.typedPriceCents)}
            </p>
          )
        )}
      </Section>

      {modules.costs && data.costs.length > 0 && (
        <Section title={m.job_costs()}>
          <ul className="flex flex-col px-4">
            {data.costs.map((cost) => (
              <li
                key={cost._id}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <span>
                  {cost.label} · {formatDay(cost.date, today)}
                </span>
                <span className="tabular-nums">
                  {formatMoney(cost.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {modules.items && client && !client.isNoClient && (
        <Section
          title={words.item.plural}
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
                  className: 'h-11 rounded-xl',
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
        <Section title={m.job_notes()}>
          <p className="px-4 text-sm whitespace-pre-wrap">{job.notes}</p>
        </Section>
      )}

      <Section title={m.job_files()}>
        <FileGallery
          businessId={business._id}
          target={{ kind: 'job', jobId: job._id }}
        />
      </Section>

      {data.timeline.length > 0 && (
        <Section title={m.job_history()}>
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
              {panel?.kind === 'lines'
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
