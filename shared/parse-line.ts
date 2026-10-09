// The one-line new job (prototype 2, variant B): a notebook-style line such
// as "Иван Петров, гардероб, 950, капаро 300, до 20.10", read back as fields.
import { addDays, addMonths, isValidDate, weekdayOf } from './dates'
import { parseMoney } from './money'
import { digitsOf, foldName, searchClients, similarClients } from './search'
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

/** Money the line says is already received, other than a deposit. `cents` is null for the whole price. */
export type ParsedPaid = { cents: number | null }

export type ParsedLine = {
  client: ParsedClient | null
  /** Every client the client part matched, when more than one did. */
  candidates: ClientCandidate[]
  /** The phone typed in the line, as typed. */
  phone: string | null
  /** The existing client that phone already belongs to. */
  phoneOwner: ClientCandidate | null
  /** The name typed, when the phone's owner was taken in its place. */
  typedName: string | null
  /** Existing clients a new name is a typo or two away from. */
  similar: ClientCandidate[]
  title: string
  service: ServiceRef | null
  priceCents: number | null
  depositCents: number | null
  paid: ParsedPaid | null
  date: ParsedDate | null
}

/** The Sofia wall clock, to tell whether a bare time is still ahead today. */
export type ClockTime = { hour: number; minute: number }

export type ParseContext = {
  /** "YYYY-MM-DD" in Sofia. */
  today: string
  /** The time now in Sofia. Without it a bare time is always today. */
  now?: ClockTime
  clients: ClientCandidate[]
  services: ServiceRef[]
  /** The built-in walk-in client's name, typed to pick it. */
  noClientName: string
}

// "1 200" uses a space for thousands, so only groups of three may follow one.
const MONEY = String.raw`(\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|евро|eur|лв\.?|лева)?`
const DEPOSIT_WORD = String.raw`(?:капаро|аванс|предплата|депозит)`
// A deposit or payment can say how it was paid; cash is the default, so the words only need to go.
const CASH = String.raw`в\s+брой`
const PAID_WORD = String.raw`(?:платено|платена|платен|платих|платили|получих|получено)`
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
  шест: 6,
  седем: 7,
  осем: 8,
  девет: 9,
  десет: 10,
}
// Month names and their short forms, longest first; the first three letters say which month.
const MONTH_NAMES =
  'януари|яну|февруари|фев|март|мар|април|апр|май|юни|юли|август|авг|септември|септ|сеп|октомври|окт|ноември|ноем|ное|декември|дек'
const MONTH_STARTS = [
  'яну',
  'фев',
  'мар',
  'апр',
  'май',
  'юни',
  'юли',
  'авг',
  'сеп',
  'окт',
  'ное',
  'дек',
]

const pad = (value: number) => String(value).padStart(2, '0')

function money(text: string) {
  return parseMoney(text)
}

function weekdayIndex(text: string) {
  const full = WEEKDAYS.indexOf(text)
  return full >= 0 ? full : WEEKDAY_SHORT.indexOf(text)
}

/** A day and month, and a year when given. Without a year, a day already past means next year's (D31). */
function dayMonthDate(
  day: string,
  month: number,
  rawYear: string | undefined,
  today: string,
) {
  const thisYear = Number(today.slice(0, 4))
  const year = rawYear
    ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear)
    : thisYear
  const candidate = `${year}-${pad(month)}-${pad(Number(day))}`
  if (!isValidDate(candidate)) return null
  const date =
    !rawYear && candidate < today
      ? `${year + 1}-${pad(month)}-${pad(Number(day))}`
      : candidate
  return isValidDate(date) ? date : null
}

const DAY_MONTH_NAME = new RegExp(
  String.raw`^(\d{1,2})(?:-(?:ви|ри|ти))?\s+(${MONTH_NAMES})\.?(?:\s+(\d{4}))?$`,
)

// A time with nothing else around it: "11:00", "от 9:30 ч", "в 11". "от 5" alone is not
// one: it is too often part of a title or a price.
const BARE_TIME =
  /^(?:в\s*(\d{1,2})(?::(\d{2}))?|(?:от\s*)?(\d{1,2}):(\d{2}))\s*(?:ч\.?)?$/

export function parseDate(
  segment: string,
  today: string,
  now?: ClockTime,
): ParsedDate | null {
  let base = segment.toLocaleLowerCase('bg').trim()
  let time: ParsedDate['time']

  // A time alone is the next time the clock reads it: today, or tomorrow once it has passed.
  const bare = BARE_TIME.exec(base)
  if (bare) {
    // Which alternative matched decides which groups are there.
    const groups: Array<string | undefined> = bare
    const hour = Number(groups[1] ?? groups[3])
    const minute = Number(groups[2] ?? groups[4] ?? 0)
    if (hour > 23 || minute > 59) return null
    const passed =
      now !== undefined && hour * 60 + minute <= now.hour * 60 + now.minute
    return {
      date: passed ? addDays(today, 1) : today,
      time: { hour, minute },
    }
  }

  const timeMatch =
    base.match(/\s+(?:в|от)?\s*(\d{1,2}):(\d{2})\s*(?:ч\.?)?$/) ??
    base.match(/\s+(?:в|от)\s+(\d{1,2})\s*(?:ч\.?)?$/)
  if (timeMatch && timeMatch.index !== undefined) {
    const hour = Number(timeMatch[1])
    const minute = timeMatch[2] ? Number(timeMatch[2]) : 0
    if (hour > 23 || minute > 59) return null
    time = { hour, minute }
    base = base.slice(0, timeMatch.index).trim()
  }
  const text = base.replace(/^(?:във|в|на|до|срок|за)\s+/, '')

  let date: string | null = null
  if (text === 'днес') date = today
  else if (text === 'утре') date = addDays(today, 1)
  else if (text === 'вдругиден') date = addDays(today, 2)
  else {
    const weekday = weekdayIndex(text)
    const nextWeek = text.match(/^следващ(?:ия|ият|ата|ото)\s+(.+)$/)
    if (weekday >= 0) {
      date = addDays(today, (weekday - weekdayOf(today) + 7) % 7 || 7)
    } else if (nextWeek && weekdayIndex(nextWeek[1]) >= 0) {
      // The week after this one (weeks run Monday to Sunday), not just the next such day.
      const nextMonday = addDays(today, (8 - weekdayOf(today)) % 7 || 7)
      date = addDays(nextMonday, (weekdayIndex(nextWeek[1]) + 6) % 7)
    }
    const dayMonth = text.match(
      /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/,
    )
    const dayName = text.match(DAY_MONTH_NAME)
    if (dayMonth) {
      date = dayMonthDate(dayMonth[1], Number(dayMonth[2]), dayMonth[3], today)
    } else if (dayName) {
      const month = MONTH_STARTS.indexOf(dayName[2].slice(0, 3)) + 1
      date = dayMonthDate(dayName[1], month, dayName[3], today)
    }
    // "след 2 седмици" and "за 3 седмици" both mean that long from today.
    // "след месец" needs no number; "за месец" is too often just a title ("за месец").
    const after = base.match(
      /^(след|за)\s+(\d+|един|една|два|две|три|четири|пет|шест|седем|осем|девет|десет)?\s*(ден|дни|дена|седмица|седмици|месец|месеца)$/,
    )
    if (after && (after[1] === 'след' || after[2])) {
      const count = after[2] ? (NUMBER_WORDS[after[2]] ?? Number(after[2])) : 1
      const unit = after[3]
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

/** Digits a whole Bulgarian or international number has, by how it starts. */
function phoneLengthFits(text: string) {
  const digits = digitsOf(text).length
  if (text.startsWith('+')) return digits >= 10 && digits <= 15
  if (text.startsWith('00')) return digits >= 12 && digits <= 17
  return text.startsWith('0') && digits >= 9 && digits <= 10
}

/**
 * A phone inside a segment ("Иван 0888 123 456 маса"), split out with the
 * words before and after it. The longest run of tokens that fits wins, so
 * "0888 123 456" is taken whole and a price after it stays a price.
 */
function splitInlinePhone(segment: string) {
  const tokens = segment.split(/\s+/)
  for (let start = 0; start < tokens.length; start++) {
    if (!/^(\+|0)\d/.test(tokens[start])) continue
    for (let end = Math.min(tokens.length, start + 5); end > start; end--) {
      const candidate = tokens.slice(start, end).join(' ')
      if (isPhone(candidate) && phoneLengthFits(candidate)) {
        return [
          tokens.slice(0, start).join(' '),
          candidate,
          tokens.slice(end).join(' '),
        ].filter(Boolean)
      }
    }
  }
  return null
}

function findService(services: ServiceRef[], title: string) {
  const wanted = foldName(title)
  if (!wanted) return null
  // Exact only: "гардероб" must not pick up "Гардероб, на линеен метър" and its per-metre price.
  return services.find((service) => foldName(service.name) === wanted) ?? null
}

// What a payment looks like, most specific first: "платено 40", "в брой 40",
// "40 платено", then "платено" alone, which is the whole price.
const PAID_PATTERNS: Array<{
  pattern: RegExp
  cents: (match: RegExpExecArray) => number | null
}> = [
  {
    pattern: new RegExp(
      `(?:^|\\s)${PAID_WORD}\\s*:?\\s*${MONEY}(?:\\s*${CASH})?(?=\\s|$)`,
      'i',
    ),
    cents: (match) => money(match[1]),
  },
  {
    pattern: new RegExp(`(?:^|\\s)${CASH}\\s*:?\\s*${MONEY}(?=\\s|$)`, 'i'),
    cents: (match) => money(match[1]),
  },
  {
    pattern: new RegExp(
      `(?:^|\\s)${MONEY}\\s*(?:${PAID_WORD}|${CASH})\\s*$`,
      'i',
    ),
    cents: (match) => money(match[1]),
  },
  {
    pattern: new RegExp(`(?:^|\\s)${PAID_WORD}(?:\\s+${CASH})?\\s*$`, 'i'),
    cents: () => null,
  },
]

/** The first payment phrase in the text, and where it sits. */
function findPaid(text: string): { cents: number | null; rest: string } | null {
  for (const { pattern, cents } of PAID_PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      return {
        cents: cents(match),
        rest: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
          .replace(/\s+/g, ' ')
          .trim(),
      }
    }
  }
  return null
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
  let paid: ParsedPaid | null = null
  let date: ParsedDate | null = null
  let phone: string | null = null
  const rest: string[] = []
  const exactMoney = new RegExp(`^${MONEY}$`, 'i')
  // A deposit and a payment are both "money received now": the first one said stays.
  const depositWord = new RegExp(
    `(?:^|\\s)${DEPOSIT_WORD}\\s*:?\\s*${MONEY}(?:\\s*${CASH})?`,
    'i',
  )

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const depositMatch =
      segment.match(
        new RegExp(`^${DEPOSIT_WORD}\\s*:?\\s*${MONEY}(?:\\s+${CASH})?$`, 'i'),
      ) ??
      segment.match(
        new RegExp(`^${MONEY}\\s*${DEPOSIT_WORD}(?:\\s+${CASH})?$`, 'i'),
      )
    const wholePaid = findPaid(segment)
    const isPaid =
      (wholePaid !== null && !wholePaid.rest) ||
      new RegExp(`^${CASH}$`, 'i').test(segment)
    if (depositMatch || isPaid) {
      // One payment per line: a second one stays in the title to be seen, not half-read.
      if (depositMatch ? paid !== null : depositCents !== null) {
        rest.push(segment)
      } else if (depositMatch) {
        depositCents = money(depositMatch[1])
      } else {
        paid = { cents: wholePaid?.cents ?? null }
      }
      continue
    }
    if (isPhone(segment)) {
      phone = segment
      continue
    }
    // No commas around the phone: read it as if they were there.
    const split = phone === null ? splitInlinePhone(segment) : null
    if (split) {
      segments.splice(index, 1, ...split)
      index--
      continue
    }
    const parsedDate = parseDate(segment, ctx.today, ctx.now)
    if (parsedDate) {
      date = parsedDate
      continue
    }
    const exactPrice = exactMoney.exec(segment)
    if (priceCents === null && exactPrice) {
      priceCents = money(exactPrice[1])
      continue
    }
    // A segment that mixes words with fields ("кухня 3400 утре"): peel the
    // fields off the end, in any order, until nothing more comes off.
    let words = segment
    for (let pass = 0; pass < 4; pass++) {
      const before = words
      const inlineDeposit = depositWord.exec(words)
      if (depositCents === null && paid === null && inlineDeposit) {
        depositCents = money(inlineDeposit[1])
        words =
          `${words.slice(0, inlineDeposit.index)} ${words.slice(inlineDeposit.index + inlineDeposit[0].length)}`
            .replace(/\s+/g, ' ')
            .trim()
      }
      const inlinePaid: ReturnType<typeof findPaid> =
        depositCents === null && paid === null ? findPaid(words) : null
      if (inlinePaid) {
        paid = { cents: inlinePaid.cents }
        words = inlinePaid.rest
      }
      const tokens = words.split(/\s+/)
      for (
        let n = Math.min(5, tokens.length - 1);
        n >= 1 && date === null;
        n--
      ) {
        const tail = parseDate(tokens.slice(-n).join(' '), ctx.today, ctx.now)
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
      const exactWords = exactMoney.exec(words)
      if (priceCents === null && exactWords) {
        priceCents = money(exactWords[1])
        words = ''
      }
      if (words === before) break
    }
    if (words) rest.push(words)
  }

  let client: ParsedClient | null = null
  let candidates: ClientCandidate[] = []
  let typedName: string | null = null
  // The client a typed phone already belongs to.
  const phoneHit = phone ? searchClients(ctx.clients, phone).at(0) : undefined

  if (rest.length && foldName(rest[0]) === foldName(ctx.noClientName)) {
    client = { kind: 'none' }
    rest.shift()
  } else if (rest.length) {
    const hits =
      /^[A-ZА-Я„"]/.test(rest[0]) || rest.length > 1
        ? searchClients(ctx.clients, rest[0])
        : []
    // Two "Иван"s and a phone: the phone says which one.
    if (phoneHit && hits.some((hit) => hit.id === phoneHit.id)) {
      client = { kind: 'existing', id: phoneHit.id }
      rest.shift()
    } else if (
      phoneHit &&
      (hits.length || (rest.length > 1 && looksLikeName(rest[0])))
    ) {
      // A phone that is already somebody's wins over the name typed with it.
      // A name that matched other clients stays one tap away; a new name stays offered.
      client = { kind: 'existing', id: phoneHit.id }
      candidates = hits.length ? [phoneHit, ...hits] : []
      if (!hits.length) typedName = rest[0]
      rest.shift()
    } else if (hits.length) {
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
    client = phoneHit
      ? { kind: 'existing', id: phoneHit.id }
      : { kind: 'new', name: phone, phone }
  }

  const title = rest.join(', ')
  const service = findService(ctx.services, title)
  // Paid with no price said: what was paid is what the work cost, unless the
  // service list names the price.
  if (priceCents === null && paid?.cents && !service) priceCents = paid.cents
  return {
    client,
    candidates,
    phone,
    phoneOwner: phoneHit ?? null,
    typedName,
    // A new name close to a client's is offered as that client, never taken for them.
    similar:
      client?.kind === 'new' && client.name !== phone
        ? similarClients(ctx.clients, client.name)
        : [],
    title,
    service,
    priceCents,
    depositCents,
    paid,
    date,
  }
}

// A service priced per metre, hour or piece would teach a unit price as a total.
const PER_UNIT =
  /(?<!\p{L})(?:метър|метра|кв|м2|м²|час|часа|бр|кг|литър|литра)(?!\p{L})/iu

/** A service whose name reads as one thing on one line: no comma, no unit. */
function isPlainService(service: ServiceRef) {
  return (
    service.priceCents >= 100 &&
    service.name.length <= 40 &&
    !/[,;/]/.test(service.name) &&
    !PER_UNIT.test(service.name)
  )
}

/** About a third of the total, in round numbers, and always less than it. */
function sampleDeposit(total: number) {
  const step = total >= 500 ? 50 : 10
  const rounded = Math.round((total * 0.3) / step) * step
  return Math.min(Math.max(rounded, step), Math.floor(total / 2))
}

/**
 * A sample line in the business's own terms, shown under the input: a plain
 * total, like "Иван Петров, гардероб, 950, капаро 300, до петък". A service is
 * used only when its name and price read as a whole job.
 */
export function exampleLine(
  settings: {
    services: ServiceRef[]
    deposits: boolean
    flow: 'single' | 'multi'
  },
  sampleName: string,
  sampleTitle = 'ремонт',
) {
  const service = settings.services
    .filter(isPlainService)
    .sort((a, b) => b.priceCents - a.priceCents)
    .at(0)
  const total = service
    ? Math.round(service.priceCents / 100)
    : settings.flow === 'single'
      ? 80
      : 950
  const parts = [
    sampleName,
    service ? service.name.toLocaleLowerCase('bg') : sampleTitle,
    String(total),
  ]
  if (settings.deposits && sampleDeposit(total) >= 1) {
    parts.push(`капаро ${sampleDeposit(total)}`)
  }
  parts.push(settings.flow === 'single' ? 'утре 10:00' : 'до петък')
  return parts.join(', ')
}
