// The one-line new job (prototype 2, variant B): a notebook-style line such
// as "Иван Петров, гардероб, 950, капаро 300, до 20.10", read back as fields.
import { addDays, addMonths, isValidDate, weekdayOf } from './dates'
import { parseMoney } from './money'
import { digitsOf, foldName, searchClients } from './search'
import type { ClientCandidate } from './search'

export type ParsedClient =
  | { kind: 'existing'; id: string }
  | { kind: 'new'; name: string; phone?: string }
  | { kind: 'none' }

export type ParsedDate = {
  date: string
  time?: { hour: number; minute: number }
}

export type ServiceRef = { id: string; name: string; priceCents: number }

export type ParsedLine = {
  client: ParsedClient | null
  /** Every client the client part matched, when more than one did. */
  candidates: ClientCandidate[]
  title: string
  service: ServiceRef | null
  priceCents: number | null
  depositCents: number | null
  date: ParsedDate | null
}

export type ParseContext = {
  /** "YYYY-MM-DD" in Sofia. */
  today: string
  clients: ClientCandidate[]
  services: ServiceRef[]
  /** The built-in walk-in client's name, typed to pick it. */
  noClientName: string
}

// "1 200" uses a space for thousands, so only groups of three may follow one.
const MONEY = String.raw`(\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|евро|eur|лв\.?|лева)?`
const DEPOSIT_WORD = String.raw`(?:капаро|аванс|депозит)`
const WEEKDAYS = [
  'неделя',
  'понеделник',
  'вторник',
  'сряда',
  'четвъртък',
  'петък',
  'събота',
]
const WEEKDAY_SHORT = ['нед', 'пон', 'вт', 'ср', 'чет', 'пет', 'съб']
const NUMBER_WORDS: Partial<Record<string, number>> = {
  един: 1,
  една: 1,
  два: 2,
  две: 2,
  три: 3,
  четири: 4,
  пет: 5,
}

const pad = (value: number) => String(value).padStart(2, '0')

function money(text: string) {
  return parseMoney(text)
}

export function parseDate(segment: string, today: string): ParsedDate | null {
  let text = segment
    .toLocaleLowerCase('bg')
    .trim()
    .replace(/^(?:във|в|на|до|срок|за)\s+/, '')
  let time: ParsedDate['time']

  const timeMatch =
    text.match(/\s+(?:в|от)?\s*(\d{1,2}):(\d{2})\s*(?:ч\.?)?$/) ??
    text.match(/\s+(?:в|от)\s+(\d{1,2})\s*(?:ч\.?)?$/)
  if (timeMatch && timeMatch.index !== undefined) {
    const hour = Number(timeMatch[1])
    const minute = timeMatch[2] ? Number(timeMatch[2]) : 0
    if (hour > 23 || minute > 59) return null
    time = { hour, minute }
    text = text.slice(0, timeMatch.index).trim()
  }

  let date: string | null = null
  if (text === 'днес') date = today
  else if (text === 'утре') date = addDays(today, 1)
  else if (text === 'вдругиден') date = addDays(today, 2)
  else {
    const weekday =
      WEEKDAYS.indexOf(text) >= 0
        ? WEEKDAYS.indexOf(text)
        : WEEKDAY_SHORT.indexOf(text)
    if (weekday >= 0) {
      date = addDays(today, (weekday - weekdayOf(today) + 7) % 7 || 7)
    }
    const dayMonth = text.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/)
    if (dayMonth) {
      const [, day, month, rawYear] = dayMonth
      const thisYear = Number(today.slice(0, 4))
      const year = rawYear
        ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear)
        : thisYear
      const candidate = `${year}-${pad(Number(month))}-${pad(Number(day))}`
      if (!isValidDate(candidate)) return null
      // Without a year, a day already past means next year's.
      date =
        !rawYear && candidate < today
          ? `${year + 1}-${pad(Number(month))}-${pad(Number(day))}`
          : candidate
      if (!isValidDate(date)) return null
    }
    const after = text.match(
      /^след\s+(\d+|един|една|два|две|три|четири|пет)?\s*(ден|дни|дена|седмица|седмици|месец|месеца)$/,
    )
    if (after) {
      const count = after[1] ? (NUMBER_WORDS[after[1]] ?? Number(after[1])) : 1
      const unit = after[2]
      date = unit.startsWith('м')
        ? addMonths(today, count)
        : addDays(today, count * (unit.startsWith('с') ? 7 : 1))
    }
  }

  if (!date) return null
  return time ? { date, time } : { date }
}

function looksLikeName(text: string) {
  const words = text.split(/\s+/)
  return words.length <= 3 && words.every((word) => /^[A-ZА-Я„"]/.test(word))
}

function isPhone(segment: string) {
  return /^\+?[\d\s()-]+$/.test(segment) && digitsOf(segment).length >= 9
}

function findService(services: ServiceRef[], title: string) {
  const wanted = foldName(title)
  if (!wanted) return null
  // Exact only: "гардероб" must not pick up "Гардероб, на линеен метър" and its per-metre price.
  return services.find((service) => foldName(service.name) === wanted) ?? null
}

export function parseLine(text: string, ctx: ParseContext): ParsedLine {
  // "1200,50" is a decimal comma, not a separator: no space and 1–2 digits after it.
  const segments = text
    .replace(/(\d),(\d{1,2})(?![\d,])/g, '$1.$2')
    .split(/[,;\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  let priceCents: number | null = null
  let depositCents: number | null = null
  let date: ParsedDate | null = null
  let phone: string | null = null
  const rest: string[] = []
  const exactMoney = new RegExp(`^${MONEY}$`, 'i')

  for (const segment of segments) {
    const depositMatch =
      segment.match(new RegExp(`^${DEPOSIT_WORD}\\s*:?\\s*${MONEY}$`, 'i')) ??
      segment.match(new RegExp(`^${MONEY}\\s*${DEPOSIT_WORD}$`, 'i'))
    if (depositMatch) {
      depositCents = money(depositMatch[1])
      continue
    }
    if (isPhone(segment)) {
      phone = segment
      continue
    }
    const parsedDate = parseDate(segment, ctx.today)
    if (parsedDate) {
      date = parsedDate
      continue
    }
    if (priceCents === null && exactMoney.test(segment)) {
      priceCents = money(segment)
      continue
    }
    // A segment that mixes words with fields ("кухня 3400 утре"): peel the
    // fields off the end, in any order, until nothing more comes off.
    let words = segment
    for (let pass = 0; pass < 4; pass++) {
      const before = words
      const inlineDeposit = words.match(
        new RegExp(`(?:^|\\s)${DEPOSIT_WORD}\\s*:?\\s*${MONEY}`, 'i'),
      )
      if (
        depositCents === null &&
        inlineDeposit &&
        inlineDeposit.index !== undefined
      ) {
        depositCents = money(inlineDeposit[1])
        words =
          `${words.slice(0, inlineDeposit.index)} ${words.slice(inlineDeposit.index + inlineDeposit[0].length)}`
            .replace(/\s+/g, ' ')
            .trim()
      }
      const tokens = words.split(/\s+/)
      for (
        let n = Math.min(3, tokens.length - 1);
        n >= 1 && date === null;
        n--
      ) {
        const tail = parseDate(tokens.slice(-n).join(' '), ctx.today)
        if (tail) {
          date = tail
          words = tokens.slice(0, -n).join(' ')
        }
      }
      const trailing = words.match(new RegExp(`^(.*\\D)\\s+${MONEY}$`, 'i'))
      if (priceCents === null && trailing) {
        priceCents = money(trailing[2])
        words = trailing[1].trim()
      }
      if (priceCents === null && exactMoney.test(words)) {
        priceCents = money(words)
        words = ''
      }
      if (words === before) break
    }
    if (words) rest.push(words)
  }

  let client: ParsedClient | null = null
  let candidates: ClientCandidate[] = []

  if (rest.length && foldName(rest[0]) === foldName(ctx.noClientName)) {
    client = { kind: 'none' }
    rest.shift()
  } else if (rest.length) {
    const hits =
      /^[A-ZА-Я„"]/.test(rest[0]) || rest.length > 1
        ? searchClients(ctx.clients, rest[0])
        : []
    if (hits.length) {
      client = { kind: 'existing', id: hits[0].id }
      candidates = hits.length > 1 ? hits : []
      rest.shift()
    } else if (rest.length > 1 && looksLikeName(rest[0])) {
      client = { kind: 'new', name: rest[0], ...(phone ? { phone } : {}) }
      rest.shift()
    } else if (rest.length === 1 && /^[A-ZА-Я„"]/.test(rest[0])) {
      // No commas: "Иван Петров гардероб" → longest leading run of words that is a client.
      const words = rest[0].split(/\s+/)
      for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
        const prefixHits = searchClients(
          ctx.clients,
          words.slice(0, n).join(' '),
        )
        if (prefixHits.length) {
          client = { kind: 'existing', id: prefixHits[0].id }
          candidates = prefixHits.length > 1 ? prefixHits : []
          rest[0] = words.slice(n).join(' ')
          break
        }
      }
    }
  }

  if (!client && phone) {
    const hit = searchClients(ctx.clients, phone)[0] as
      ClientCandidate | undefined
    client = hit
      ? { kind: 'existing', id: hit.id }
      : { kind: 'new', name: phone, phone }
  }

  const title = rest.join(', ')
  return {
    client,
    candidates,
    title,
    service: findService(ctx.services, title),
    priceCents,
    depositCents,
    date,
  }
}

/** A sample line in the business's own terms, shown under the input. */
export function exampleLine(
  settings: {
    services: ServiceRef[]
    deposits: boolean
    flow: 'single' | 'multi'
  },
  sampleName: string,
  sampleTitle = 'ремонт',
) {
  const service = [...settings.services]
    .sort((a, b) => b.priceCents - a.priceCents)
    .at(0)
  const parts = [
    sampleName,
    service ? service.name.toLocaleLowerCase('bg') : sampleTitle,
  ]
  if (service) parts.push(String(Math.round(service.priceCents / 100)))
  if (settings.deposits) parts.push('капаро 100')
  parts.push(settings.flow === 'single' ? 'утре 10:00' : 'до петък')
  return parts.join(', ')
}
