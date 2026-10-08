import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  CoinsIcon,
  CubeIcon,
  FlagIcon,
  NotePencilIcon,
  RepeatIcon,
  StackIcon,
  TagIcon,
  UserIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { cn } from 'cn'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientPicker } from '#/components/new-job/client-picker'
import type { ItemRef, PaymentMethod } from '#/components/new-job/types'
import { Stopwatch } from '#/components/stopwatch'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import { repeatLabel } from '#/components/job/repeat-section'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { usePageGuard } from '#/hooks/use-discard-guard'
import { usePageTitle } from '#/hooks/use-page-title'
import { useWide } from '#/hooks/use-wide'
import type { ActiveBusiness } from '#/hooks/use-viewer'
import { formatDay, formatTime } from '#/i18n/dates'
import { METHOD_LABEL } from '#/i18n/money'
import { lower } from '#/i18n/words'
import { errorMessage } from '#/lib/errors'
import { recordTiming } from '#/lib/timing'
import { m } from '#/paraglide/messages.js'
import { todayInSofia } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'
import { readDraft, saveArgs, startFixes } from '../../../shared/new-job-draft'
import type { ClientChoice, DraftFixes } from '../../../shared/new-job-draft'
import { exampleLine, parseLine } from '../../../shared/parse-line'
import type { ServiceRef } from '../../../shared/parse-line'
import { formatPhone } from '../../../shared/phone-format'
import type { ClientCandidate } from '../../../shared/search'

type Fixable = 'client' | 'title' | 'price' | 'deposit' | 'date'

const METHODS = [
  'cash',
  'bank',
  'card',
  'other',
] as const satisfies Array<PaymentMethod>

function ReadRow({
  label,
  icon: IconComponent,
  value,
  missing,
  errorId,
  onFix,
  fixing = false,
  children,
}: {
  label: string
  icon: Icon
  value: React.ReactNode
  missing?: string | false
  /** Where the missing message can be found, to move focus to it. */
  errorId?: string
  /** Left out for a row that is changed by tapping what it shows. */
  onFix?: () => void
  fixing?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <IconComponent
            aria-hidden
            className={cn(
              'size-4 shrink-0 transition-colors',
              value && 'text-primary',
            )}
          />
          {label}
        </span>
        {/* The one live region: it announces what the line was read as, and
            nothing of the fields below it. */}
        <span
          aria-live="polite"
          className="min-w-0 flex-1 text-base break-words"
        >
          <span
            // Re-keyed when a value first appears, so it rises in as it's understood.
            key={value ? 'set' : 'unset'}
            className={cn(
              'block',
              value ? 'animate-rise' : 'text-muted-foreground',
            )}
          >
            {value || '–'}
          </span>
        </span>
        {onFix && !fixing && (
          <Button
            variant="link"
            className="h-11 shrink-0 px-1"
            aria-label={`${m.new_fix()}: ${label}`}
            onClick={onFix}
          >
            {m.new_fix()}
          </Button>
        )}
      </div>
      {missing && (
        <p
          id={errorId}
          role="alert"
          tabIndex={-1}
          className="ps-27 text-sm text-destructive outline-none"
        >
          {missing}
        </p>
      )}
      {children && <div className="ps-27">{children}</div>}
    </div>
  )
}

/**
 * "+" (prototype 2, variant B): one notebook-style line, read back as client,
 * title, price, deposit and date. Every field can be fixed before saving.
 */
export function NewJobForm({
  business,
  clients,
  services,
  start,
  items,
}: {
  business: ActiveBusiness
  clients: ClientCandidate[]
  services: ServiceRef[]
  /** Started from an item: its client is chosen already, and the job is linked to the item. */
  start?: {
    client: { id: string; name: string }
    item?: { id: Id<'items'>; name: string }
  }
  items: ItemRef[]
}) {
  const navigate = useNavigate()
  usePageTitle(m.preview_add({ job: lower(business.words.job.singular) }))
  const save = useMutation(api.newJob.save)
  const [startedAt] = useState(() => Date.now())
  const [today] = useState(() => todayInSofia(Date.now()))
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fixing, setFixing] = useState<Fixable | null>(null)
  // Fixes made by hand. A fix holds until the line reads that field differently.
  const [fixes, setFixes] = useState<DraftFixes>(() => startFixes(start))
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash')
  const [depositDate, setDepositDate] = useState(today)

  const single = business.jobFlow === 'single'
  const { words } = business
  const parsed = parseLine(text, {
    today,
    clients,
    services,
    noClientName: m.no_client(),
  })
  const draft = readDraft(parsed, fixes, {
    clients,
    items,
    start,
    depositsOnNewJob: business.depositsOnNewJob,
  })
  const {
    client: chosenClient,
    title: chosenTitle,
    priceCents: chosenPrice,
    receivedCents: chosenDeposit,
    date: chosenDate,
    isPayment,
    linkedItem,
    clientItems,
    itemIds: pickedItems,
  } = draft
  // A business set up for fixed-schedule work repeats new jobs by default (setup step 6).
  const [repeat, setRepeat] = useState(business.repeatDefault !== undefined)

  const setClient = (value: ClientChoice | null) =>
    setFixes(draft.fix.client(value))
  const setTitle = (value: string) => setFixes(draft.fix.title(value))
  const setPrice = (value: string) => setFixes(draft.fix.price(value))
  const setDeposit = (value: string) => setFixes(draft.fix.received(value))
  const toggleItem = (itemId: string) => setFixes(draft.fix.item(itemId))
  const setDate = (value: typeof chosenDate) => setFixes(draft.fix.date(value))
  const onText = (value: string) => setText(value)
  // Back where "+" was opened: the item or the client (the new job is in its
  // list), otherwise Today.
  const leave = () =>
    start?.item
      ? navigate({ to: '/items/$itemId', params: { itemId: start.item.id } })
      : start
        ? navigate({
            to: '/clients/$clientId',
            params: { clientId: start.client.id },
          })
        : navigate({ to: '/' })

  // Leaving with a line typed asks first, whether by the close button or the back button.
  const guard = usePageGuard(text.trim() !== '', {
    title: m.new_discard_title(),
    body: m.new_discard_body(),
    discardLabel: m.new_discard(),
    keepLabel: m.new_keep_writing(),
  })
  // Esc closes "+" like the close button, at a desk; a dialog or menu open
  // above it (the discard question included) takes its own Esc.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      )
        return
      void leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const wide = useWide()
  // Set when a save finds something missing: the first thing wrong gets focus.
  const [failure, setFailure] = useState<{
    id: number
    client: boolean
  }>()
  useEffect(() => {
    if (!failure) return
    document
      .getElementById(failure.client ? 'new-error-client' : 'new-title')
      ?.focus()
  }, [failure])

  const submit = async (markDone = false) => {
    setTried(true)
    const args = saveArgs(draft, {
      flow: business.jobFlow,
      received: { date: depositDate, method: depositMethod },
      depositLabel: m.deposit_label(),
      done: markDone,
      repeat: repeat ? business.repeatDefault : undefined,
    })
    if (!args) {
      // A missing title opens its input; a missing client shows its picker.
      if (draft.missing.title) setFixing('title')
      setFailure({ id: Date.now(), client: draft.missing.client })
      return
    }
    if (!navigator.onLine) {
      toast.error(m.offline_edit_blocked())
      return
    }
    setSaving(true)
    try {
      const jobTitle = args.title
      // The draft's ids came from the server's own lists, so they are its ids.
      const { jobId } = await save({
        businessId: business._id,
        ...(args as Omit<FunctionArgs<typeof api.newJob.save>, 'businessId'>),
      })
      recordTiming('newJob', Date.now() - startedAt)
      // Today may not list a far-off job, so the toast names it and opens it.
      toast.success(m.new_saved_job({ title: jobTitle }), {
        duration: 8000,
        action: {
          label: m.new_open(),
          onClick: () =>
            void navigate({ to: '/jobs/$jobId', params: { jobId } }),
        },
      })
      guard.release()
      await leave()
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  const sourceLabel =
    draft.clientSource === null || draft.clientSource === 'none'
      ? null
      : {
          phone: m.new_source_phone,
          existing: m.new_source_existing,
          contact: m.new_source_contact,
          new: m.new_source_new,
        }[draft.clientSource]()
  const clientName =
    chosenClient &&
    (chosenClient.kind === 'none' ? m.no_client() : chosenClient.name)
  const { phone } = draft
  const alternatives = draft.alternatives.map((item) => ({
    choice: item.choice,
    label:
      item.as === 'create'
        ? m.new_create_client({ name: item.name })
        : item.as === 'similar'
          ? m.new_similar({ name: item.name })
          : item.name,
  }))
  const isChosen = (choice: ClientChoice) =>
    chosenClient?.kind === choice.kind &&
    (choice.kind !== 'existing' ||
      (chosenClient.kind === 'existing' && chosenClient.id === choice.id))
  const dateText =
    chosenDate &&
    `${formatDay(chosenDate.date, today)}${
      single
        ? chosenDate.time
          ? `, ${formatTime(chosenDate.time)}`
          : ` (${m.new_no_time()})`
        : ''
    }`
  const done = (
    <Button
      variant="secondary"
      className="h-11 rounded-xl"
      onClick={() => setFixing(null)}
    >
      {m.new_done_fixing()}
    </Button>
  )

  return (
    // A wide screen shows the flow as a card in the middle of the page.
    <main className="flex min-h-dvh flex-col bg-background lg:mx-auto lg:my-8 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:w-full lg:max-w-2xl lg:overflow-hidden lg:rounded-3xl lg:border lg:shadow-xl lg:shadow-zinc-900/10">
      <Stopwatch startedAt={startedAt} />
      <header className="flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-2">
        <h1 className="text-xl font-semibold">
          {m.preview_add({ job: lower(words.job.singular) })}
        </h1>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={m.new_close()}
          onClick={() => void leave()}
        >
          <XIcon />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Field>
          <FieldLabel htmlFor="line" className="text-base">
            <NotePencilIcon className="size-5" />
            {m.new_line_label()}
          </FieldLabel>
          <Textarea
            id="line"
            name="line"
            autoFocus
            rows={3}
            maxLength={500}
            className="min-h-24 rounded-xl text-lg"
            value={text}
            onChange={(event) => onText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <FieldDescription>
            {m.new_example({
              line: exampleLine(
                {
                  services,
                  deposits: business.depositsOnNewJob,
                  flow: business.jobFlow,
                },
                m.example_client(),
                m.example_title(),
              ),
            })}
          </FieldDescription>
        </Field>

        <section className="mt-4 flex flex-col divide-y">
          <h2 className="pb-1 text-sm font-semibold">{m.new_readback()}</h2>

          <ReadRow
            label={words.client.singular}
            icon={UserIcon}
            fixing={fixing === 'client'}
            onFix={() => setFixing('client')}
            value={
              clientName && (
                <span className="flex flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    {clientName}
                    {sourceLabel && (
                      <Badge variant="secondary">{sourceLabel}</Badge>
                    )}
                  </span>
                  {phone && (
                    <span className="text-sm text-muted-foreground">
                      {formatPhone(phone)}
                    </span>
                  )}
                </span>
              )
            }
            missing={tried && !chosenClient && m.new_missing_client()}
            errorId="new-error-client"
          >
            {fixing === 'client' || (tried && !chosenClient) ? (
              <ClientPicker
                // Only a tap on "Fix" raises the keyboard, never a failed save.
                autoFocus={wide && fixing === 'client'}
                clients={clients}
                initialQuery={
                  parsed.client?.kind === 'new' ? parsed.client.name : ''
                }
                onPick={(choice) => {
                  setClient(choice)
                  setFixing(null)
                }}
              />
            ) : (
              alternatives.length > 0 && (
                <div className="flex flex-col gap-2">
                  {parsed.phoneOwner && (
                    <p className="text-sm text-muted-foreground">
                      {m.duplicate_warning({ name: parsed.phoneOwner.name })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {alternatives.map(({ choice, label }) => (
                      <Button
                        key={
                          choice.kind === 'existing' ? choice.id : choice.kind
                        }
                        variant={isChosen(choice) ? 'secondary' : 'outline'}
                        aria-pressed={isChosen(choice)}
                        className="h-auto min-h-11 max-w-full rounded-xl py-2 whitespace-normal"
                        onClick={() => setClient(choice)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )
            )}
          </ReadRow>

          {linkedItem && clientItems.length === 0 && (
            <ReadRow
              label={words.item.singular}
              icon={StackIcon}
              value={linkedItem.name}
            />
          )}

          <ReadRow
            label={m.new_what()}
            icon={ClipboardTextIcon}
            value={chosenTitle}
            fixing={fixing === 'title'}
            onFix={() => setFixing('title')}
            missing={tried && !chosenTitle.trim() && m.new_missing_title()}
            errorId="new-error-title"
          >
            {fixing === 'title' && (
              <div className="flex gap-2">
                <Input
                  id="new-title"
                  name="title"
                  autoFocus
                  aria-label={m.new_what()}
                  aria-invalid={tried && !chosenTitle.trim()}
                  aria-describedby={
                    tried && !chosenTitle.trim() ? 'new-error-title' : undefined
                  }
                  maxLength={200}
                  value={chosenTitle}
                  onChange={(event) => setTitle(event.target.value)}
                />
                {done}
              </div>
            )}
          </ReadRow>

          {clientItems.length > 0 && (
            <ReadRow
              label={words.item.singular}
              icon={CubeIcon}
              value={clientItems
                .filter((item) => pickedItems.includes(item.id))
                .map((item) => item.name)
                .join(', ')}
            >
              <div className="flex flex-wrap gap-2">
                {clientItems.map((item) => (
                  <Button
                    key={item.id}
                    variant={
                      pickedItems.includes(item.id) ? 'secondary' : 'outline'
                    }
                    aria-pressed={pickedItems.includes(item.id)}
                    className="h-auto min-h-11 max-w-full rounded-xl py-2 whitespace-normal aria-pressed:border-primary"
                    onClick={() => toggleItem(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            </ReadRow>
          )}

          <ReadRow
            label={m.new_price()}
            icon={TagIcon}
            fixing={fixing === 'price'}
            onFix={() => setFixing('price')}
            value={
              chosenPrice !== null && (
                <span className="flex flex-wrap items-center gap-2">
                  {formatMoney(chosenPrice)}
                  {draft.priceFromService && (
                    <Badge variant="secondary">
                      {m.new_price_from_service()}
                    </Badge>
                  )}
                </span>
              )
            }
          >
            {fixing === 'price' && (
              <div className="flex gap-2">
                <MoneyInput
                  name="price"
                  label={m.new_price()}
                  value={draft.priceText}
                  onChange={setPrice}
                />
                {done}
              </div>
            )}
          </ReadRow>

          {draft.showReceived && (
            <ReadRow
              label={isPayment ? m.new_paid() : m.new_deposit()}
              icon={CoinsIcon}
              fixing={fixing === 'deposit'}
              onFix={() => setFixing('deposit')}
              value={
                chosenDeposit !== null &&
                chosenDeposit > 0 &&
                `${formatMoney(chosenDeposit)}, ${lower(METHOD_LABEL[depositMethod]())}`
              }
            >
              {fixing === 'deposit' && (
                <div className="flex flex-col gap-3">
                  <MoneyInput
                    name="deposit"
                    label={isPayment ? m.new_paid() : m.new_deposit()}
                    value={draft.receivedText}
                    onChange={setDeposit}
                  />
                  <ToggleGroup
                    aria-label={m.new_deposit_method()}
                    value={[depositMethod]}
                    onValueChange={(next: string[]) => {
                      if (next[0]) setDepositMethod(next[0] as PaymentMethod)
                    }}
                    variant="outline"
                    size="xl"
                    className="w-full flex-wrap"
                  >
                    {METHODS.map((method) => (
                      <ToggleGroupItem key={method} value={method}>
                        {METHOD_LABEL[method]()}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <Field>
                    <FieldLabel htmlFor="deposit-date">
                      {m.new_deposit_date()}
                    </FieldLabel>
                    <Input
                      id="deposit-date"
                      name="deposit-date"
                      type="date"
                      value={depositDate}
                      onChange={(event) =>
                        setDepositDate(event.target.value || today)
                      }
                    />
                  </Field>
                  <div>{done}</div>
                </div>
              )}
            </ReadRow>
          )}

          <ReadRow
            label={single ? m.new_when() : m.new_due()}
            icon={single ? CalendarBlankIcon : FlagIcon}
            value={dateText}
            fixing={fixing === 'date'}
            onFix={() => setFixing('date')}
          >
            {fixing === 'date' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Field>
                    <FieldLabel htmlFor="job-date">
                      {m.new_date_label()}
                    </FieldLabel>
                    <Input
                      id="job-date"
                      name="date"
                      type="date"
                      value={chosenDate?.date ?? ''}
                      onChange={(event) =>
                        setDate(
                          event.target.value
                            ? {
                                date: event.target.value,
                                ...(chosenDate?.time
                                  ? { time: chosenDate.time }
                                  : {}),
                              }
                            : null,
                        )
                      }
                    />
                  </Field>
                  {single && (
                    <Field>
                      <FieldLabel htmlFor="job-time">
                        {m.new_time_label()}
                      </FieldLabel>
                      <Input
                        id="job-time"
                        name="time"
                        type="time"
                        disabled={!chosenDate}
                        value={
                          chosenDate?.time
                            ? formatTime(chosenDate.time).padStart(5, '0')
                            : ''
                        }
                        onChange={(event) => {
                          if (!chosenDate) return
                          const [hour, minute] = event.target.value
                            .split(':')
                            .map(Number)
                          setDate(
                            event.target.value
                              ? {
                                  date: chosenDate.date,
                                  time: { hour, minute },
                                }
                              : { date: chosenDate.date },
                          )
                        }}
                      />
                    </Field>
                  )}
                </div>
                <div className="flex gap-2">
                  {done}
                  {chosenDate && (
                    <Button
                      variant="ghost"
                      className="h-11 rounded-xl"
                      onClick={() => setDate(null)}
                    >
                      {m.new_clear()}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </ReadRow>
          {business.repeatDefault && (
            <div className="flex min-h-14 items-center gap-3 py-2">
              <label
                htmlFor="new-repeat"
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <RepeatIcon
                    aria-hidden
                    className={cn('size-4 shrink-0', repeat && 'text-primary')}
                  />
                  {m.repeat_read_back()}
                </span>
                <span className="text-base">
                  {repeat
                    ? repeatLabel(business.repeatDefault)
                    : m.repeat_off()}
                </span>
              </label>
              <Switch
                id="new-repeat"
                checked={repeat}
                onCheckedChange={setRepeat}
              />
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-2 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {draft.coversPrice && (
          <Button
            size="xl"
            variant="outline"
            className="w-full"
            disabled={saving}
            onClick={() => void submit(true)}
          >
            <CheckCircleIcon data-icon="inline-start" />
            {m.new_save_done()}
          </Button>
        )}
        <Button
          size="xl"
          className="w-full"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {m.new_save()}
        </Button>
      </div>
      {guard.prompt}
    </main>
  )
}

function MoneyInput({
  name,
  label,
  value,
  onChange,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <InputGroup>
      <InputGroupInput
        name={name}
        autoFocus
        aria-label={label}
        inputMode="decimal"
        maxLength={12}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>€</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
