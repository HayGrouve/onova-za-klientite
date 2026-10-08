// The "+" line's read-back: what a parsed line, the person's fixes and where
// "+" was opened from make of a new job, and the arguments it is saved with.
// The form only renders this; every rule about the new job lives here.
import { matchItem } from './line-items'
import { moneyInputText, parseMoney } from './money'
import type { ParsedDate, ParsedLine } from './parse-line'
import type { ClientCandidate } from './search'
import type { JobFlow } from './stages'

/** Who the job is for, as picked or read from the line. */
export type ClientChoice =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'contact'; name: string; phone?: string }
  | { kind: 'new'; name: string; phone?: string }
  | { kind: 'none' }

/** A client's item as "+" gets it: the folded words (model, plate) are what a word of the line is matched to. */
export type ItemRef = {
  id: string
  clientId: string
  name: string
  keys: string
}

/** A hand fix, and what the line said when it was made. */
type Fix<T> = { value: T; basis: string }

/** The fixes made by hand. A fix holds until the line reads that field differently. */
export type DraftFixes = {
  client?: Fix<ClientChoice | null>
  title?: Fix<string>
  price?: Fix<string>
  received?: Fix<string>
  date?: Fix<ParsedDate | null>
  items?: Fix<string[]>
}

export type DraftStart = {
  client: { id: string; name: string }
  item?: { id: string; name: string }
}

export type DraftContext = {
  clients: ClientCandidate[]
  items: ItemRef[]
  /** Where "+" was opened: a client, or an item and its client. */
  start?: DraftStart
  /** The business asks for a deposit on every new job (setup). */
  depositsOnNewJob: boolean
}

/** Another client the line could mean, one tap away. */
export type ClientAlternative = {
  choice: ClientChoice
  /** How the button reads: the name, "Create <name>", or "<name>?" for a near miss. */
  as: 'name' | 'create' | 'similar'
  name: string
}

const basis = (value: unknown) => JSON.stringify(value)

function held<T>(current: Fix<T> | undefined, parsedValue: unknown) {
  return current && current.basis === basis(parsedValue)
    ? current.value
    : undefined
}

/** The fixes "+" opens with: the starting client stands in for the empty line's "no client". */
export function startFixes(start?: DraftStart): DraftFixes {
  return start
    ? {
        client: {
          value: { kind: 'existing', ...start.client },
          basis: basis(null),
        },
      }
    : {}
}

const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase('bg') + text.slice(1)

export function readDraft(
  parsed: ParsedLine,
  fixes: DraftFixes,
  ctx: DraftContext,
) {
  const nameOf = (id: string) =>
    ctx.clients.find((item) => item.id === id)?.name ?? ''
  const existing = (candidate: ClientCandidate): ClientChoice => ({
    kind: 'existing',
    id: candidate.id,
    name: candidate.name,
  })

  const parsedClient: ClientChoice | null = !parsed.client
    ? null
    : parsed.client.kind === 'existing'
      ? {
          kind: 'existing',
          id: parsed.client.id,
          name: nameOf(parsed.client.id),
        }
      : parsed.client
  const clientFix = held(fixes.client, parsed.client)
  const client = clientFix === undefined ? parsedClient : clientFix

  const priceFromLine = parsed.priceCents ?? parsed.service?.priceCents ?? null
  const priceFix = held(fixes.price, priceFromLine)
  const priceCents =
    priceFix === undefined ? priceFromLine : parseMoney(priceFix)

  // Money received now is a deposit (labelled) or a plain payment (no label).
  // "Paid" with no amount means the whole price.
  const isPayment = parsed.depositCents === null && parsed.paid !== null
  const receivedBasis = [parsed.depositCents, parsed.paid]
  const receivedFromLine =
    parsed.depositCents ??
    (parsed.paid ? (parsed.paid.cents ?? priceCents) : null)
  const receivedFix = held(fixes.received, receivedBasis)
  const receivedCents =
    receivedFix === undefined ? receivedFromLine : parseMoney(receivedFix)

  const dateFix = held(fixes.date, parsed.date)
  const date = dateFix === undefined ? parsed.date : dateFix

  // An item belongs to one client, so fixing the client to another unlinks it.
  const linkedItem =
    ctx.start &&
    client?.kind === 'existing' &&
    client.id === ctx.start.client.id
      ? ctx.start.item
      : undefined
  // The client's items: one a word of the line names is picked, the rest are one tap away.
  const clientItems =
    client?.kind === 'existing'
      ? ctx.items.filter((item) => item.clientId === client.id)
      : []
  const itemMatch = clientItems.length
    ? matchItem(parsed.title, clientItems)
    : null
  const itemBasis = [
    client?.kind === 'existing' ? client.id : null,
    itemMatch?.id ?? null,
  ]
  // Started from an item, that item is picked until the line names another.
  const startItems = linkedItem ? [linkedItem.id] : []
  const itemIds = clientItems.length
    ? (held(fixes.items, itemBasis) ??
      (itemMatch ? [itemMatch.id] : startItems))
    : startItems

  // The item's word leaves the title only while its item is picked.
  const title =
    held(fixes.title, parsed.title) ??
    (itemMatch && itemIds.includes(itemMatch.id)
      ? itemMatch.title
      : parsed.title)

  // Other clients the line could mean: several matches, a phone that is
  // somebody else's, or a new name a typo from a client.
  const alternatives: ClientAlternative[] =
    parsed.candidates.length > 1
      ? parsed.candidates.map((candidate) => ({
          choice: existing(candidate),
          as: 'name',
          name: candidate.name,
        }))
      : parsed.typedName && parsed.phoneOwner
        ? [
            {
              choice: existing(parsed.phoneOwner),
              as: 'name',
              name: parsed.phoneOwner.name,
            },
            {
              choice: {
                kind: 'new',
                name: parsed.typedName,
                phone: parsed.phone ?? undefined,
              },
              as: 'create',
              name: parsed.typedName,
            },
          ]
        : parsed.client?.kind === 'new' && parsed.similar.length
          ? [
              ...parsed.similar.map((candidate): ClientAlternative => ({
                choice: existing(candidate),
                as: 'similar',
                name: candidate.name,
              })),
              {
                choice: {
                  kind: 'new',
                  name: parsed.client.name,
                  phone: parsed.client.phone,
                },
                as: 'create',
                name: parsed.client.name,
              },
            ]
          : []

  const fixed = <TField extends keyof DraftFixes>(
    field: TField,
    value: NonNullable<DraftFixes[TField]>['value'],
    on: unknown,
  ): DraftFixes => ({ ...fixes, [field]: { value, basis: basis(on) } })

  return {
    client,
    /** Where the client came from, for its badge. */
    clientSource:
      client?.kind === 'existing'
        ? parsed.phoneOwner?.id === client.id
          ? ('phone' as const)
          : ('existing' as const)
        : (client?.kind ?? null),
    /** The phone under the name: the stored one, or the one typed for a new client. */
    phone:
      client?.kind === 'existing'
        ? ctx.clients.find((item) => item.id === client.id)?.phones.at(0)
        : client?.kind === 'new' || client?.kind === 'contact'
          ? client.phone
          : undefined,
    alternatives,
    title,
    priceCents,
    priceText: priceFix ?? moneyInputText(priceFromLine),
    /** The price came from a service named in the line, not typed. */
    priceFromService:
      priceFix === undefined &&
      parsed.priceCents === null &&
      parsed.service !== null,
    isPayment,
    receivedCents,
    receivedText: receivedFix ?? moneyInputText(receivedFromLine),
    showReceived:
      ctx.depositsOnNewJob ||
      parsed.depositCents !== null ||
      parsed.paid !== null ||
      receivedCents !== null,
    /** A payment that covers the whole price can save the job as Done. */
    coversPrice:
      isPayment &&
      receivedCents !== null &&
      receivedCents > 0 &&
      priceCents !== null &&
      priceCents > 0 &&
      receivedCents >= priceCents,
    date,
    linkedItem,
    clientItems,
    itemIds,
    missing: { client: client === null, title: title.trim() === '' },
    /** The fixes with one more made by hand. */
    fix: {
      client: (value: ClientChoice | null) =>
        fixed('client', value, parsed.client),
      title: (value: string) => fixed('title', value, parsed.title),
      price: (value: string) => fixed('price', value, priceFromLine),
      received: (value: string) => fixed('received', value, receivedBasis),
      date: (value: ParsedDate | null) => fixed('date', value, parsed.date),
      item: (itemId: string) =>
        fixed(
          'items',
          itemIds.includes(itemId)
            ? itemIds.filter((id) => id !== itemId)
            : [...itemIds, itemId],
          itemBasis,
        ),
    },
  }
}

export type NewJobDraft = ReturnType<typeof readDraft>

/**
 * The arguments `newJob.save` takes for a draft, or null while the client or
 * the title is missing. The date is an appointment for one-visit work and a
 * due date for work in stages; a deposit is labelled, a payment isn't.
 */
export function saveArgs(
  draft: NewJobDraft,
  options: {
    flow: JobFlow
    received: { date: string; method: 'cash' | 'bank' | 'card' | 'other' }
    depositLabel: string
    done: boolean
    repeat?: { every: number; unit: 'week' | 'month' }
  },
) {
  const { client, date } = draft
  if (!client || draft.missing.title) return null
  const single = options.flow === 'single'
  return {
    client:
      client.kind === 'existing'
        ? { kind: 'existing' as const, clientId: client.id }
        : client.kind === 'none'
          ? { kind: 'none' as const }
          : { kind: 'new' as const, name: client.name, phone: client.phone },
    title: capitalize(draft.title.trim()),
    typedPriceCents: draft.priceCents ?? undefined,
    deposit:
      draft.receivedCents !== null && draft.receivedCents > 0
        ? {
            amountCents: draft.receivedCents,
            ...options.received,
            label: draft.isPayment ? undefined : options.depositLabel,
          }
        : undefined,
    when: single && date ? date : undefined,
    dueDate: !single && date ? date.date : undefined,
    itemIds: draft.itemIds.length ? draft.itemIds : undefined,
    done: options.done || undefined,
    repeat: options.repeat,
  }
}
