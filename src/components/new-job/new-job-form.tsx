import {
  AddressBookIcon,
  CheckCircleIcon,
  CheckIcon,
  PhoneIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientPicker } from '#/components/new-job/client-picker'
import { Slot } from '#/components/new-job/slot'
import { useFixer } from '#/components/new-job/use-fixer'
import type { ItemRef, PaymentMethod } from '#/components/new-job/types'
import { StageBadge } from '#/components/stage-badge'
import { Stopwatch } from '#/components/stopwatch'
import { Button } from '#/components/ui/button'
import { Field, FieldLabel } from '#/components/ui/field'
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
import { runChange } from '#/lib/change'
import { recordTiming } from '#/lib/timing'
import { m } from '#/paraglide/messages.js'
import { clockInSofia, todayInSofia } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'
import { readDraft, saveArgs, startFixes } from '../../../shared/new-job-draft'
import type { ClientChoice, DraftFixes } from '../../../shared/new-job-draft'
import { exampleLine, parseLine } from '../../../shared/parse-line'
import type { ServiceRef } from '../../../shared/parse-line'
import { formatPhone } from '../../../shared/phone-format'
import type { ClientCandidate } from '../../../shared/search'
import type { StageGroup } from '../../../shared/stages'

const METHODS = [
  'cash',
  'bank',
  'card',
  'other',
] as const satisfies Array<PaymentMethod>

/** How long the typing pauses before the slots read the line again. */
const READ_PAUSE_MS = 300

/** A part just closed by a comma, a semicolon or a new line is read at once. */
const closesPart = (line: string) => /[,;\n]\s*$/.test(line)

/**
 * "+" (prototype 2, variant B, redrawn as "one thing at a time", D118): one
 * question and one notebook-style line. While it is typed, the slots under it
 * fill with what it is read as (client, the job, price, deposit, date, stage);
 * an empty slot shows the default the job saves with. Every slot can be fixed
 * in place before saving.
 */
export function NewJobForm({
  business,
  clients,
  services,
  firstStage,
  start,
  items,
}: {
  business: ActiveBusiness
  clients: ClientCandidate[]
  services: ServiceRef[]
  /** Where a new job starts, for the stage slot. */
  firstStage?: { name: string; group: StageGroup }
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
  // The line as the slots last read it: the typing settles first (D118).
  const [readText, setReadText] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const lineRef = useRef<HTMLTextAreaElement>(null)
  // Which field is being fixed; the title's box may have been opened by a failed save.
  const fixer = useFixer()
  const { fixing, titleOpenedByError } = fixer
  // A save is under way or done: a second Enter or tap must not make a second job.
  const submitting = useRef(false)
  // Fixes made by hand. A fix holds until the line reads that field differently.
  const [fixes, setFixes] = useState<DraftFixes>(() => startFixes(start))
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash')
  const [depositDate, setDepositDate] = useState(today)

  const single = business.jobFlow === 'single'
  const { words } = business
  const read = (line: string) => {
    const parsed = parseLine(line, {
      today,
      // A bare time ("11:00") means the next time the clock reads it.
      now: clockInSofia(Date.now()),
      clients,
      services,
      noClientName: m.no_client(),
    })
    return {
      parsed,
      draft: readDraft(parsed, fixes, {
        clients,
        items,
        start,
        depositsOnNewJob: business.depositsOnNewJob,
      }),
    }
  }
  const { parsed, draft } = read(readText)
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
  const toggleFix = (field: NonNullable<typeof fixing>) =>
    fixing === field ? fixer.close() : fixer.open(field)

  const onText = (value: string) => {
    setText(value)
    if (value.trim() === '' || closesPart(value)) setReadText(value)
  }
  // Mid-part, the slots wait for a short pause, so they don't flicker
  // through every letter of a name.
  useEffect(() => {
    if (readText === text) return
    const id = window.setTimeout(() => setReadText(text), READ_PAUSE_MS)
    return () => window.clearTimeout(id)
  }, [text, readText])

  const example = exampleLine(
    {
      services,
      deposits: business.depositsOnNewJob,
      flow: business.jobFlow,
    },
    m.example_client(),
    m.example_title(),
  )
  const tryExample = () => {
    onText(example)
    const line = lineRef.current
    if (!line) return
    line.focus()
    line.setSelectionRange(example.length, example.length)
  }

  // Once the line itself reads a title, the box a failed save opened has
  // nothing left to say: the read-out shows it. A hand fix keeps its box.
  if (titleOpenedByError && parsed.title.trim()) fixer.closeIfOpenedByError()
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
  // Set when a save finds the title missing: its input gets focus.
  const [failure, setFailure] = useState<number>()
  useEffect(() => {
    if (failure) document.getElementById('new-title')?.focus()
  }, [failure])

  const submit = async (markDone = false) => {
    if (submitting.current) return
    setTried(true)
    // Saved straight after typing, the line is read now, not after the pause.
    setReadText(text)
    const current = text === readText ? draft : read(text).draft
    const args = saveArgs(current, {
      flow: business.jobFlow,
      received: { date: depositDate, method: depositMethod },
      depositLabel: m.deposit_label(),
      done: markDone,
      repeat: repeat ? business.repeatDefault : undefined,
    })
    if (!args) {
      // A missing title opens its input.
      fixer.openAfterError()
      setFailure(Date.now())
      return
    }
    submitting.current = true
    setSaving(true)
    const ran = await runChange(async () => {
      // The draft's ids came from the server's own lists, so they are its ids.
      const { jobId } = await save({
        businessId: business._id,
        ...(args as Omit<FunctionArgs<typeof api.newJob.save>, 'businessId'>),
      })
      recordTiming('newJob', Date.now() - startedAt)
      // Today may not list a far-off job, so the toast names it and opens it.
      toast.success(m.new_saved_job({ title: args.title }), {
        duration: 8000,
        action: {
          label: m.new_open(),
          onClick: () =>
            void navigate({ to: '/jobs/$jobId', params: { jobId } }),
        },
      })
    })
    if (!ran.done) {
      submitting.current = false
      setSaving(false)
      return
    }
    // The job is saved. Going back is a separate step: if it fails the job
    // still exists, so the line is cleared and the form takes a new one.
    try {
      await guard.releaseWhile(leave)
    } catch {
      setText('')
      setReadText('')
      setTried(false)
      submitting.current = false
      setSaving(false)
    }
  }

  const clientName =
    chosenClient.kind === 'none' ? m.no_client() : chosenClient.name
  const { phone } = draft
  // A client from the list is marked as known; a new one says it will be added.
  const source =
    draft.clientSource === 'none'
      ? null
      : {
          existing: { icon: CheckIcon, label: m.new_source_existing() },
          phone: { icon: PhoneIcon, label: m.new_source_phone() },
          contact: { icon: AddressBookIcon, label: m.new_source_contact() },
          new: { icon: PlusIcon, label: m.new_source_new() },
        }[draft.clientSource]
  const known =
    draft.clientSource === 'existing' || draft.clientSource === 'phone'
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
    chosenClient.kind === choice.kind &&
    (choice.kind !== 'existing' ||
      (chosenClient.kind === 'existing' && chosenClient.id === choice.id))
  const dateText = chosenDate
    ? `${formatDay(chosenDate.date, today)}${
        single && chosenDate.time ? `, ${formatTime(chosenDate.time)}` : ''
      }`
    : single
      ? m.new_no_date()
      : m.job_no_due()
  const received = chosenDeposit !== null && chosenDeposit > 0
  const receivedText = received
    ? formatMoney(chosenDeposit)
    : isPayment
      ? m.new_not_paid()
      : m.new_no_deposit()
  const receivedNote = `${lower(METHOD_LABEL[depositMethod]())}${
    depositDate === today ? '' : `, ${formatDay(depositDate, today)}`
  }`
  const done = (
    <Button
      variant="secondary"
      className="h-11 rounded-xl"
      onClick={() => fixer.close()}
    >
      {m.new_done_fixing()}
    </Button>
  )

  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <Stopwatch startedAt={startedAt} />
      {/* One column, phone and desk alike: the question, the line, the slots
          it fills, then Save. On a wide screen it stays centred and narrow,
          so the eye goes straight down from a typed part to its slot. */}
      <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col px-4 lg:pt-10 lg:pb-12">
        <header className="flex items-center justify-between gap-2 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {m.new_question()}
          </h1>
          <Button
            variant="ghost"
            size="icon-xl"
            className="-me-2"
            aria-label={m.new_close()}
            onClick={() => void leave()}
          >
            <XIcon />
          </Button>
        </header>

        <Field className="gap-2">
          <FieldLabel
            htmlFor="line"
            className="text-sm font-normal text-muted-foreground"
          >
            {m.new_line_label()}
          </FieldLabel>
          <Textarea
            ref={lineRef}
            id="line"
            name="line"
            autoFocus
            rows={3}
            maxLength={500}
            // Enter saves the line (Shift+Enter is a new line): say so on the
            // phone's keyboard, which covers the Save button while it is up.
            enterKeyHint="done"
            className="min-h-28 rounded-2xl px-4 py-3 text-lg leading-snug md:text-lg"
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
          {/* A sample in the business's own terms. While the line is empty,
              a tap writes it in, so the slots show what they do. */}
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{m.new_example_label()}</span>
            {text === '' ? (
              <button
                type="button"
                className="min-h-11 text-start text-foreground underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 transition-colors outline-none hover:decoration-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={tryExample}
              >
                {example}
              </button>
            ) : (
              <span className="flex min-h-11 items-center">{example}</span>
            )}
          </div>
        </Field>

        <section className="mt-4 flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            {m.new_readback()}
          </h2>
          <div className="flex flex-col divide-y divide-border/70 overflow-hidden surface">
            <Slot
              label={words.client.singular}
              show={`${clientName}|${draft.clientSource}|${phone ?? ''}`}
              quiet={draft.clientByDefault}
              value={clientName}
              note={
                (source || phone) && (
                  <>
                    {source && (
                      <span
                        className={
                          known
                            ? 'flex items-center gap-1 text-primary'
                            : 'flex items-center gap-1'
                        }
                      >
                        <source.icon aria-hidden className="size-3.5" />
                        {source.label}
                      </span>
                    )}
                    {phone && <span>{formatPhone(phone)}</span>}
                  </>
                )
              }
              fixing={fixing === 'client'}
              onFix={() => toggleFix('client')}
            >
              {fixing === 'client' ? (
                <ClientPicker
                  // Only a tap on the slot raises the keyboard, and only at a desk.
                  autoFocus={wide}
                  clients={clients}
                  initialQuery={
                    parsed.client?.kind === 'new' ? parsed.client.name : ''
                  }
                  onPick={(choice) => {
                    setClient(choice)
                    fixer.close()
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
            </Slot>

            {linkedItem && clientItems.length === 0 && (
              <Slot
                label={words.item.singular}
                show={linkedItem.name}
                value={linkedItem.name}
              />
            )}

            <Slot
              label={words.job.singular}
              show={chosenTitle.trim()}
              quiet={!chosenTitle.trim()}
              // Saved with a capital first letter, so it reads that way here.
              value={
                <span className="block first-letter:uppercase">
                  {chosenTitle.trim() || '–'}
                </span>
              }
              fixing={fixing === 'title'}
              onFix={() => toggleFix('title')}
              missing={tried && !chosenTitle.trim() && m.new_missing_title()}
              errorId="new-error-title"
            >
              {fixing === 'title' && (
                <div className="flex gap-2">
                  <Input
                    id="new-title"
                    name="title"
                    autoFocus
                    aria-label={words.job.singular}
                    aria-invalid={tried && !chosenTitle.trim()}
                    aria-describedby={
                      tried && !chosenTitle.trim()
                        ? 'new-error-title'
                        : undefined
                    }
                    maxLength={200}
                    value={chosenTitle}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  {done}
                </div>
              )}
            </Slot>

            {clientItems.length > 0 && (
              <Slot
                label={words.item.singular}
                show={pickedItems.join()}
                quiet={pickedItems.length === 0}
                value={
                  clientItems
                    .filter((item) => pickedItems.includes(item.id))
                    .map((item) => item.name)
                    .join(', ') || '–'
                }
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
              </Slot>
            )}

            <Slot
              label={m.new_price()}
              show={`${chosenPrice}|${draft.priceFromService}`}
              quiet={chosenPrice === null}
              value={
                chosenPrice === null
                  ? m.new_no_price()
                  : formatMoney(chosenPrice)
              }
              note={draft.priceFromService && m.new_price_from_service()}
              fixing={fixing === 'price'}
              onFix={() => toggleFix('price')}
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
            </Slot>

            {draft.showReceived && (
              <Slot
                label={isPayment ? m.new_paid() : m.new_deposit()}
                show={`${receivedText}|${received ? receivedNote : ''}`}
                quiet={!received}
                value={receivedText}
                note={received && receivedNote}
                fixing={fixing === 'deposit'}
                onFix={() => toggleFix('deposit')}
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
              </Slot>
            )}

            <Slot
              label={single ? m.new_when() : m.new_due()}
              show={dateText}
              quiet={!chosenDate}
              value={dateText}
              note={single && chosenDate && !chosenDate.time && m.new_no_time()}
              fixing={fixing === 'date'}
              onFix={() => toggleFix('date')}
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
            </Slot>

            {/* New jobs start in the first stage; the job page moves them on. */}
            {firstStage && (
              <Slot
                label={m.preview_stage()}
                show={firstStage.name}
                quiet
                value={
                  <StageBadge
                    name={firstStage.name}
                    group={firstStage.group}
                    className="h-auto text-base font-normal"
                  />
                }
              />
            )}

            {business.repeatDefault && (
              <div className="flex min-h-14 items-center gap-3 px-4 py-2">
                <label
                  htmlFor="new-repeat"
                  className="flex min-w-0 flex-1 items-baseline gap-3"
                >
                  <span className="w-24 shrink-0 text-sm text-muted-foreground">
                    {m.repeat_read_back()}
                  </span>
                  <span
                    className={
                      repeat
                        ? 'text-base font-medium'
                        : 'text-base text-muted-foreground'
                    }
                  >
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
          </div>
        </section>

        {/* On a phone Save stays at the bottom, in thumb reach, as the page
            scrolls; at a desk it follows the slots. */}
        <div className="flex-1 lg:hidden" />
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-col gap-2 bg-canvas/95 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:static lg:mx-0 lg:mt-6 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
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
