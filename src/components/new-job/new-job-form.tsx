import {
  CalendarBlankIcon,
  ClipboardTextIcon,
  CoinsIcon,
  FlagIcon,
  NotePencilIcon,
  RepeatIcon,
  TagIcon,
  UserIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientPicker } from '#/components/new-job/client-picker'
import type { ClientChoice, PaymentMethod } from '#/components/new-job/types'
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
import type { ActiveBusiness } from '#/hooks/use-viewer'
import { formatDay, formatTime } from '#/i18n/dates'
import { lower } from '#/i18n/words'
import { errorMessage } from '#/lib/errors'
import { recordTiming } from '#/lib/timing'
import { m } from '#/paraglide/messages.js'
import { todayInSofia } from '../../../shared/dates'
import { formatMoney, parseMoney } from '../../../shared/money'
import { exampleLine, parseLine } from '../../../shared/parse-line'
import type { ParsedDate, ServiceRef } from '../../../shared/parse-line'
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
  onFix,
  fixing,
  children,
}: {
  label: string
  icon: Icon
  value: React.ReactNode
  missing?: string | false
  onFix: () => void
  fixing: boolean
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
        <span
          // Re-keyed when a value first appears, so it rises in as it's understood.
          key={value ? 'set' : 'unset'}
          className={cn(
            'min-w-0 flex-1 text-base',
            value ? 'animate-rise' : 'text-muted-foreground',
          )}
        >
          {value || '-'}
        </span>
        {!fixing && (
          <Button variant="link" className="h-11 shrink-0 px-1" onClick={onFix}>
            {m.new_fix()}
          </Button>
        )}
      </div>
      {missing && <p className="ps-27 text-sm text-destructive">{missing}</p>}
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
}: {
  business: ActiveBusiness
  clients: ClientCandidate[]
  services: ServiceRef[]
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
  const [clientFix, setClientFix] = useState<Fix<ClientChoice | null>>()
  const [titleFix, setTitleFix] = useState<Fix<string>>()
  const [priceFix, setPriceFix] = useState<Fix<string>>()
  const [depositFix, setDepositFix] = useState<Fix<string>>()
  const [dateFix, setDateFix] = useState<Fix<ParsedDate | null>>()
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash')
  const [depositDate, setDepositDate] = useState(today)

  const single = business.jobFlow === 'single'
  const { words } = business
  const clientsById = useMemo(
    () => new Map(clients.map((item) => [item.id, item])),
    [clients],
  )
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
  const deposit = held(depositFix, parsed.depositCents)
  const date = held(dateFix, parsed.date)
  const chosenClient = client === undefined ? parsedClient : client
  const chosenTitle = title ?? parsed.title
  const chosenPrice = price === undefined ? priceFromLine : parseMoney(price)
  const chosenDeposit =
    deposit === undefined ? parsed.depositCents : parseMoney(deposit)
  const chosenDate = date === undefined ? parsed.date : date
  const showDeposit = business.depositsOnNewJob || chosenDeposit !== null
  // A business set up for fixed-schedule work repeats new jobs by default (setup step 6).
  const [repeat, setRepeat] = useState(business.repeatDefault !== undefined)

  const setClient = (value: ClientChoice | null) =>
    setClientFix(fix(value, parsed.client))
  const setTitle = (value: string) => setTitleFix(fix(value, parsed.title))
  const setPrice = (value: string) => setPriceFix(fix(value, priceFromLine))
  const setDeposit = (value: string) =>
    setDepositFix(fix(value, parsed.depositCents))
  const setDate = (value: ParsedDate | null) =>
    setDateFix(fix(value, parsed.date))
  const onText = (value: string) => setText(value)

  const submit = async () => {
    setTried(true)
    if (!chosenClient || !chosenTitle.trim()) return
    if (!navigator.onLine) {
      toast.error(m.offline_edit_blocked())
      return
    }
    setSaving(true)
    try {
      await save({
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
        title: capitalize(chosenTitle.trim()),
        typedPriceCents: chosenPrice ?? undefined,
        deposit:
          chosenDeposit && chosenDeposit > 0
            ? {
                amountCents: chosenDeposit,
                date: depositDate,
                method: depositMethod,
                label: m.deposit_label(),
              }
            : undefined,
        when: single && chosenDate ? chosenDate : undefined,
        dueDate: !single && chosenDate ? chosenDate.date : undefined,
        repeat:
          repeat && business.repeatDefault ? business.repeatDefault : undefined,
      })
      recordTiming('newJob', Date.now() - startedAt)
      toast.success(m.new_saved())
      await navigate({ to: '/' })
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  const sourceLabel =
    chosenClient?.kind === 'existing'
      ? m.new_source_existing()
      : chosenClient?.kind === 'contact'
        ? m.new_source_contact()
        : chosenClient?.kind === 'new'
          ? m.new_source_new()
          : null
  const clientName =
    chosenClient &&
    (chosenClient.kind === 'none' ? m.no_client() : chosenClient.name)
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
          onClick={() => void navigate({ to: '/' })}
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
            autoFocus
            rows={3}
            maxLength={500}
            className="min-h-24 rounded-xl text-lg"
            value={text}
            onChange={(event) => onText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
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

        <section className="mt-4 flex flex-col divide-y" aria-live="polite">
          <h2 className="pb-1 text-sm font-semibold">{m.new_readback()}</h2>

          <ReadRow
            label={words.client.singular}
            icon={UserIcon}
            fixing={fixing === 'client'}
            onFix={() => setFixing('client')}
            value={
              clientName && (
                <span className="flex flex-wrap items-center gap-2">
                  {clientName}
                  {sourceLabel && (
                    <Badge variant="secondary">{sourceLabel}</Badge>
                  )}
                </span>
              )
            }
            missing={tried && !chosenClient && m.new_missing_client()}
          >
            {fixing === 'client' || (tried && !chosenClient) ? (
              <ClientPicker
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
              parsed.candidates.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {parsed.candidates.map((candidate) => (
                    <Button
                      key={candidate.id}
                      variant={
                        chosenClient?.kind === 'existing' &&
                        chosenClient.id === candidate.id
                          ? 'secondary'
                          : 'outline'
                      }
                      className="h-11 rounded-xl"
                      onClick={() =>
                        setClient({
                          kind: 'existing',
                          id: candidate.id,
                          name: candidate.name,
                        })
                      }
                    >
                      {candidate.name}
                    </Button>
                  ))}
                </div>
              )
            )}
          </ReadRow>

          <ReadRow
            label={m.new_what()}
            icon={ClipboardTextIcon}
            value={chosenTitle}
            fixing={fixing === 'title'}
            onFix={() => setFixing('title')}
            missing={tried && !chosenTitle.trim() && m.new_missing_title()}
          >
            {fixing === 'title' && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  aria-label={m.new_what()}
                  maxLength={200}
                  value={chosenTitle}
                  onChange={(event) => setTitle(event.target.value)}
                />
                {done}
              </div>
            )}
          </ReadRow>

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
              label={m.new_deposit()}
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
                    label={m.new_deposit()}
                    value={
                      deposit ??
                      (parsed.depositCents === null
                        ? ''
                        : formatMoney(parsed.depositCents).replace(/\s?€/, ''))
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
                      <ToggleGroupItem
                        key={method.value}
                        value={method.value}
                        className="aria-pressed:border-primary aria-pressed:bg-primary/8"
                      >
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

      <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
    </main>
  )
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <InputGroup>
      <InputGroupInput
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
