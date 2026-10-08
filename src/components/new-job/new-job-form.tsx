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
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientPicker } from '#/components/new-job/client-picker'
import { DiscardSheet } from '#/components/discard-sheet'
import type {
  ClientChoice,
  ItemRef,
  PaymentMethod,
} from '#/components/new-job/types'
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
import { usePageTitle } from '#/hooks/use-page-title'
import { useWide } from '#/hooks/use-wide'
import type { ActiveBusiness } from '#/hooks/use-viewer'
import { formatDay, formatTime } from '#/i18n/dates'
import { lower } from '#/i18n/words'
import { errorMessage } from '#/lib/errors'
import { recordTiming } from '#/lib/timing'
import { m } from '#/paraglide/messages.js'
import { todayInSofia } from '../../../shared/dates'
import { formatMoney, parseMoney } from '../../../shared/money'
import { matchItem } from '../../../shared/line-items'
import { exampleLine, parseLine } from '../../../shared/parse-line'
import type { ParsedDate, ServiceRef } from '../../../shared/parse-line'
import { formatPhone } from '../../../shared/phone-format'
import type { ClientCandidate } from '../../../shared/search'

type Fixable = 'client' | 'title' | 'price' | 'deposit' | 'date'

/** A hand fix, and what the line said when it was made. */
type Fix<T> = { value: T; basis: string }

function fix<T>(value: T, parsedValue: unknown): Fix<T> {
  return { value, basis: JSON.stringify(parsedValue) }
}

/** The fix, while the line still reads the field the way it did. */
function held<T>(
  current: Fix<T> | undefined,
  parsedValue: unknown,
): T | undefined {
  return current && current.basis === JSON.stringify(parsedValue)
    ? current.value
    : undefined
}

const METHODS: Array<{ value: PaymentMethod; label: () => string }> = [
  { value: 'cash', label: m.method_cash },
  { value: 'bank', label: m.method_bank },
  { value: 'card', label: m.method_card },
  { value: 'other', label: m.method_other },
]

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase('bg') + text.slice(1)
}

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
  // An empty line reads no client, which is what the starting client is a fix of.
  const [clientFix, setClientFix] = useState<
    Fix<ClientChoice | null> | undefined
  >(() =>
    start
      ? fix(
          { kind: 'existing', id: start.client.id, name: start.client.name },
          null,
        )
      : undefined,
  )
  const [titleFix, setTitleFix] = useState<Fix<string>>()
  const [priceFix, setPriceFix] = useState<Fix<string>>()
  const [depositFix, setDepositFix] = useState<Fix<string>>()
  const [dateFix, setDateFix] = useState<Fix<ParsedDate | null>>()
  const [itemFix, setItemFix] = useState<Fix<string[]>>()
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash')
  const [depositDate, setDepositDate] = useState(today)

  const single = business.jobFlow === 'single'
  const { words } = business
  const clientsById = useMemo(
    () => new Map(clients.map((item) => [item.id, item])),
    [clients],
  )
  const itemsByClient = useMemo(() => {
    const byClient = new Map<string, ItemRef[]>()
    for (const item of items) {
      byClient.set(item.clientId, [
        ...(byClient.get(item.clientId) ?? []),
        item,
      ])
    }
    return byClient
  }, [items])
  const parsed = parseLine(text, {
    today,
    clients,
    services,
    noClientName: m.no_client(),
  })

  const parsedClient: ClientChoice | null = !parsed.client
    ? null
    : parsed.client.kind === 'existing'
      ? {
          kind: 'existing',
          id: parsed.client.id,
          name: clientsById.get(parsed.client.id)?.name ?? '',
        }
      : parsed.client
  const priceFromLine = parsed.priceCents ?? parsed.service?.priceCents ?? null
  const client = held(clientFix, parsed.client)
  const title = held(titleFix, parsed.title)
  const price = held(priceFix, priceFromLine)
  const date = held(dateFix, parsed.date)
  const chosenClient = client === undefined ? parsedClient : client
  const chosenPrice = price === undefined ? priceFromLine : parseMoney(price)
  // Money received now is a deposit (labelled) or a plain payment (no label).
  const isPayment = parsed.depositCents === null && parsed.paid !== null
  const paymentFromLine =
    parsed.depositCents ??
    (parsed.paid ? (parsed.paid.cents ?? chosenPrice) : null)
  const deposit = held(depositFix, [parsed.depositCents, parsed.paid])
  const chosenDeposit =
    deposit === undefined ? paymentFromLine : parseMoney(deposit)
  const chosenDate = date === undefined ? parsed.date : date
  const showDeposit =
    business.depositsOnNewJob ||
    parsed.depositCents !== null ||
    parsed.paid !== null ||
    chosenDeposit !== null
  // An item belongs to one client, so fixing the client to another unlinks it.
  const linkedItem =
    start &&
    chosenClient?.kind === 'existing' &&
    chosenClient.id === start.client.id
      ? start.item
      : undefined
  // A payment that covers the whole price can save the job as done.
  const coversPrice =
    isPayment &&
    chosenDeposit !== null &&
    chosenDeposit > 0 &&
    chosenPrice !== null &&
    chosenPrice > 0 &&
    chosenDeposit >= chosenPrice

  // The client's items: one a word of the line names is picked, the rest are one tap away.
  const clientItems =
    chosenClient?.kind === 'existing'
      ? (itemsByClient.get(chosenClient.id) ?? [])
      : []
  const itemMatch = clientItems.length
    ? matchItem(parsed.title, clientItems)
    : null
  const itemBasis = [
    chosenClient?.kind === 'existing' ? chosenClient.id : null,
    itemMatch?.id ?? null,
  ]
  // Started from an item, that item is picked until the line names another.
  const startItems = linkedItem ? [linkedItem.id] : []
  const pickedItems = clientItems.length
    ? (held(itemFix, itemBasis) ?? (itemMatch ? [itemMatch.id] : startItems))
    : startItems
  // The item's word leaves the title only while its item is picked.
  const chosenTitle =
    title ??
    (itemMatch && pickedItems.includes(itemMatch.id)
      ? itemMatch.title
      : parsed.title)
  // A business set up for fixed-schedule work repeats new jobs by default (setup step 6).
  const [repeat, setRepeat] = useState(business.repeatDefault !== undefined)

  const setClient = (value: ClientChoice | null) =>
    setClientFix(fix(value, parsed.client))
  const setTitle = (value: string) => setTitleFix(fix(value, parsed.title))
  const setPrice = (value: string) => setPriceFix(fix(value, priceFromLine))
  const setDeposit = (value: string) =>
    setDepositFix(fix(value, [parsed.depositCents, parsed.paid]))
  const toggleItem = (itemId: string) =>
    setItemFix(
      fix(
        pickedItems.includes(itemId)
          ? pickedItems.filter((id) => id !== itemId)
          : [...pickedItems, itemId],
        itemBasis,
      ),
    )
  const setDate = (value: ParsedDate | null) =>
    setDateFix(fix(value, parsed.date))
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
  const leaving = useRef(false)
  const dirty = text.trim() !== ''
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
  const blocker = useBlocker({
    shouldBlockFn: useCallback(() => dirty && !leaving.current, [dirty]),
    enableBeforeUnload: dirty,
    withResolver: true,
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
    if (!chosenClient || !chosenTitle.trim()) {
      // A missing title opens its input; a missing client shows its picker.
      if (!chosenTitle.trim()) setFixing('title')
      setFailure({ id: Date.now(), client: !chosenClient })
      return
    }
    if (!navigator.onLine) {
      toast.error(m.offline_edit_blocked())
      return
    }
    setSaving(true)
    try {
      const jobTitle = capitalize(chosenTitle.trim())
      const { jobId } = await save({
        businessId: business._id,
        client:
          chosenClient.kind === 'existing'
            ? { kind: 'existing', clientId: chosenClient.id as Id<'clients'> }
            : chosenClient.kind === 'none'
              ? { kind: 'none' }
              : {
                  kind: 'new',
                  name: chosenClient.name,
                  phone: chosenClient.phone,
                },
        title: jobTitle,
        typedPriceCents: chosenPrice ?? undefined,
        deposit:
          chosenDeposit && chosenDeposit > 0
            ? {
                amountCents: chosenDeposit,
                date: depositDate,
                method: depositMethod,
                // A payment is money received like a deposit, without the label.
                label: isPayment ? undefined : m.deposit_label(),
              }
            : undefined,
        when: single && chosenDate ? chosenDate : undefined,
        dueDate: !single && chosenDate ? chosenDate.date : undefined,
        itemIds: pickedItems.length
          ? (pickedItems as Id<'items'>[])
          : undefined,
        done: markDone || undefined,
        repeat:
          repeat && business.repeatDefault ? business.repeatDefault : undefined,
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
      leaving.current = true
      await leave()
    } catch (error) {
      leaving.current = false
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  const byPhone =
    chosenClient?.kind === 'existing' &&
    parsed.phoneOwner?.id === chosenClient.id
  const sourceLabel =
    chosenClient?.kind === 'existing'
      ? byPhone
        ? m.new_source_phone()
        : m.new_source_existing()
      : chosenClient?.kind === 'contact'
        ? m.new_source_contact()
        : chosenClient?.kind === 'new'
          ? m.new_source_new()
          : null
  const clientName =
    chosenClient &&
    (chosenClient.kind === 'none' ? m.no_client() : chosenClient.name)
  // The phone under the name: the stored one for a client in the list, the typed one for a new client.
  const phone =
    chosenClient?.kind === 'existing'
      ? clientsById.get(chosenClient.id)?.phones.at(0)
      : chosenClient?.kind === 'new' || chosenClient?.kind === 'contact'
        ? chosenClient.phone
        : undefined
  // Other clients the line could mean, one tap away: several matches, a phone that is
  // somebody else's, or a new name a typo from a client.
  const existingChoice = (candidate: ClientCandidate): ClientChoice => ({
    kind: 'existing',
    id: candidate.id,
    name: candidate.name,
  })
  const alternatives: Array<{ choice: ClientChoice; label: string }> =
    parsed.candidates.length > 1
      ? parsed.candidates.map((candidate) => ({
          choice: existingChoice(candidate),
          label: candidate.name,
        }))
      : parsed.typedName && parsed.phoneOwner
        ? [
            {
              choice: existingChoice(parsed.phoneOwner),
              label: parsed.phoneOwner.name,
            },
            {
              choice: {
                kind: 'new',
                name: parsed.typedName,
                phone: parsed.phone ?? undefined,
              },
              label: m.new_create_client({ name: parsed.typedName }),
            },
          ]
        : parsed.client?.kind === 'new' && parsed.similar.length
          ? [
              ...parsed.similar.map((candidate) => ({
                choice: existingChoice(candidate),
                label: m.new_similar({ name: candidate.name }),
              })),
              {
                choice: {
                  kind: 'new' as const,
                  name: parsed.client.name,
                  phone: parsed.client.phone,
                },
                label: m.new_create_client({ name: parsed.client.name }),
              },
            ]
          : []
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
                  {price === undefined &&
                    parsed.priceCents === null &&
                    parsed.service && (
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
                  value={
                    price ??
                    (priceFromLine === null
                      ? ''
                      : formatMoney(priceFromLine).replace(/\s?€/, ''))
                  }
                  onChange={setPrice}
                />
                {done}
              </div>
            )}
          </ReadRow>

          {showDeposit && (
            <ReadRow
              label={isPayment ? m.new_paid() : m.new_deposit()}
              icon={CoinsIcon}
              fixing={fixing === 'deposit'}
              onFix={() => setFixing('deposit')}
              value={
                chosenDeposit !== null &&
                chosenDeposit > 0 &&
                `${formatMoney(chosenDeposit)}, ${lower(METHODS.find((item) => item.value === depositMethod)!.label())}`
              }
            >
              {fixing === 'deposit' && (
                <div className="flex flex-col gap-3">
                  <MoneyInput
                    name="deposit"
                    label={isPayment ? m.new_paid() : m.new_deposit()}
                    value={
                      deposit ??
                      (paymentFromLine === null
                        ? ''
                        : formatMoney(paymentFromLine).replace(/\s?€/, ''))
                    }
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
                      <ToggleGroupItem key={method.value} value={method.value}>
                        {method.label()}
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
        {coversPrice && (
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
      <DiscardSheet
        open={blocker.status === 'blocked'}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
        title={m.new_discard_title()}
        body={m.new_discard_body()}
        discardLabel={m.new_discard()}
        keepLabel={m.new_keep_writing()}
      />
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
