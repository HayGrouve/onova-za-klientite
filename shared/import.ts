// Client import: reading a spreadsheet's cells, guessing what each column is,
// turning rows into clients and flagging the ones the business already has.
// Pure, so it is tested without a browser. The file readers (read-excel-file
// and papaparse) are loaded only when a file is chosen.

import { formatPhone, normalizePhone } from './phone'
import { transliterate } from './search'

/** Rows the server takes in one `import.clients` call. */
export const IMPORT_BATCH = 100

const MAX_PHONES = 5
const MAX_NAME = 120
const MAX_EMAIL = 200
const MAX_ADDRESS = 500
const MAX_NOTE = 5000
const MAX_EXTRA = 500

/** A sheet as text: one header per column, and the rows under it. */
export type Table = { headers: string[]; rows: string[][] }

/** What a column becomes. `extra` is an extra field, named after the column. */
export type ColumnTarget =
  | 'skip'
  | 'name'
  | 'lastName'
  | 'phone'
  | 'email'
  | 'address'
  | 'note'
  | 'company'
  | 'extra'

/** A client read from a file or the phone's contacts, before it is saved. */
export type ImportRow = {
  name: string
  kind?: 'person' | 'company'
  /** E.164, at most five. */
  phones: string[]
  email: string
  address: string
  note: string
  /** Column name → value. */
  extra: Record<string, string>
}

export type ExistingClients = {
  /** E.164 */
  phones: ReadonlySet<string>
  /** Folded with `foldName`. */
  names: ReadonlySet<string>
}

export type RowStatus = 'ok' | 'noName' | 'existing' | 'inFile'

// ---------------------------------------------------------------- the table

/** A cell as trimmed text. Dates become YYYY-MM-DD. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function uniqueHeaders(raw: string[]): string[] {
  const taken = new Set<string>()
  return raw.map((header, index) => {
    const base = header || `Колонка ${index + 1}`
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
    taken.add(name)
    return name
  })
}

/**
 * The cells of a sheet as a table: the first row with anything in it is the
 * header row. Blank rows and columns with no data are dropped.
 */
export function tableFromRows(
  raw: ReadonlyArray<ReadonlyArray<unknown>>,
): Table {
  const text = raw
    .map((row) => row.map(cellText))
    .filter((row) => row.some(Boolean))
  if (text.length === 0) return { headers: [], rows: [] }
  const [headerRow, ...dataRows] = text
  const width = Math.max(...text.map((row) => row.length))
  const keep: number[] = []
  for (let col = 0; col < width; col++) {
    if (dataRows.some((row) => row[col])) keep.push(col)
  }
  return {
    headers: uniqueHeaders(keep.map((col) => headerRow[col] ?? '')),
    rows: dataRows.map((row) => keep.map((col) => row[col] ?? '')),
  }
}

// ---------------------------------------------------------------------- CSV

/** UTF-8 (the BOM is dropped), UTF-16 with a BOM, or else windows-1251. */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

const DELIMITERS = [';', ',', '\t'] as const
type Delimiter = (typeof DELIMITERS)[number]

/** The delimiter that splits the first lines the same way every time, outside quotes. */
export function detectDelimiter(text: string): Delimiter {
  const lines: Array<Record<Delimiter, number>> = []
  let counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 }
  let inQuotes = false
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && char === '\n') {
      lines.push(counts)
      counts = { ';': 0, ',': 0, '\t': 0 }
      if (lines.length === 10) break
    } else if (!inQuotes && (DELIMITERS as readonly string[]).includes(char)) {
      counts[char as Delimiter]++
    }
  }
  if (lines.length < 10) lines.push(counts)
  const filled = lines.filter((line) => DELIMITERS.some((d) => line[d] > 0))
  let best: Delimiter = ','
  let bestScore = 0
  for (const delimiter of DELIMITERS) {
    const score = Math.min(...filled.map((line) => line[delimiter]))
    if (filled.length > 0 && score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

/** A CSV file's bytes as a table. papaparse is loaded here, on first use. */
export async function parseCsv(bytes: Uint8Array): Promise<Table> {
  const text = decodeCsv(bytes)
  const Papa = (await import('papaparse')).default
  const result = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: false,
  })
  return tableFromRows(result.data)
}

// ------------------------------------------------------------------ columns

/** Lower case, letters and digits only, one space between words. */
function foldHeader(header: string): string {
  return header
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' ')
}

// Checked in this order: a header that fits two (like "име на фирма") goes to the first.
const SYNONYMS: Array<[ColumnTarget, string[]]> = [
  [
    'lastName',
    [
      'фамилия',
      'фамилно име',
      'last name',
      'lastname',
      'surname',
      'family name',
    ],
  ],
  [
    'company',
    [
      'фирма',
      'име на фирма',
      'име на фирмата',
      'компания',
      'организация',
      'company',
      'firm',
      'organization',
      'organisation',
    ],
  ],
  [
    'phone',
    [
      'телефон',
      'тел',
      'мобилен',
      'мобилен телефон',
      'мобилен номер',
      'гсм',
      'gsm',
      'phone',
      'mobile',
      'tel',
      'cell',
      'cellphone',
      'telephone',
    ],
  ],
  [
    'email',
    [
      'имейл',
      'емейл',
      'е мейл',
      'имеил',
      'email',
      'e mail',
      'mail',
      'поща',
      'ел поща',
    ],
  ],
  ['address', ['адрес', 'address', 'улица', 'street']],
  [
    'note',
    [
      'бележка',
      'бележки',
      'забележка',
      'забележки',
      'коментар',
      'коментари',
      'note',
      'notes',
      'comment',
      'comments',
      'remarks',
    ],
  ],
  [
    'name',
    [
      'име',
      'имена',
      'три имена',
      'собствено име',
      'първо име',
      'клиент',
      'контакт',
      'name',
      'first name',
      'firstname',
      'given name',
      'full name',
      'client',
      'customer',
      'contact',
    ],
  ],
]

function targetOf(header: string): ColumnTarget {
  const folded = foldHeader(header)
  for (const [target, words] of SYNONYMS) {
    if (
      words.some((word) => folded === word || folded.startsWith(`${word} `))
    ) {
      return target
    }
  }
  return 'extra'
}

/**
 * A first guess for every column from its header, in Bulgarian or English.
 * A column nobody knows is `extra`: the mapping screen offers it as a field
 * but skips it until the person opts in (`firstChoice`). Name, last name,
 * company, e-mail, address and note take one column each (the first), phone
 * five.
 */
export function detectTargets(headers: readonly string[]): ColumnTarget[] {
  const used = new Map<ColumnTarget, number>()
  return headers.map((header) => {
    const target = targetOf(header)
    if (target === 'extra') return target
    const count = used.get(target) ?? 0
    used.set(target, count + 1)
    return count >= (target === 'phone' ? MAX_PHONES : 1) ? 'extra' : target
  })
}

/** What the mapping screen's choice for a column starts with when it is an existing field. */
export const FIELD_PREFIX = 'field:'

/**
 * The mapping screen's first choice for a column: its detected meaning, or
 * the existing field with the same name, or "skip". A column nobody knows is
 * never turned into a new field by itself: that is the person's choice.
 */
export function firstChoice(
  header: string,
  target: ColumnTarget,
  fields: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (target !== 'extra') return target
  const same = fields.find((field) => foldName(field.name) === foldName(header))
  return same ? `${FIELD_PREFIX}${same.id}` : 'skip'
}

// --------------------------------------------------------------------- rows

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() : text
}

/** "0888 123 456, 0889 654 321" or "0888 123 456 / 0889 …" → separate numbers. */
function splitPhones(cell: string): string[] {
  return cell
    .split(/\s*[,;\n\r]+\s*|\s+\/\s+|\s+(?:или|and|or)\s+/iu)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Clients from a table, given what each column is. Several columns for one
 * field are joined (names with a space, addresses with a comma, notes by line).
 * A phone that can't be read stays in the note, under its column name.
 */
export function mapRows(
  table: Table,
  targets: readonly ColumnTarget[],
): ImportRow[] {
  const rows: ImportRow[] = []
  for (const cells of table.rows) {
    const parts: Record<
      'name' | 'lastName' | 'company' | 'email' | 'address' | 'note',
      string[]
    > = {
      name: [],
      lastName: [],
      company: [],
      email: [],
      address: [],
      note: [],
    }
    const phones: string[] = []
    const leftovers: string[] = []
    const extra: Record<string, string> = {}
    let companyHeader = ''

    cells.forEach((raw, col) => {
      const cell = raw.trim()
      const target = targets[col] ?? 'skip'
      const header = table.headers[col] ?? ''
      if (!cell || target === 'skip') return
      if (target === 'extra') {
        extra[header] = clamp(cell, MAX_EXTRA)
      } else if (target === 'phone') {
        for (const piece of splitPhones(cell)) {
          const e164 = normalizePhone(piece)
          if (!e164) leftovers.push(`${header}: ${piece}`)
          else if (phones.includes(e164)) continue
          else if (phones.length < MAX_PHONES) phones.push(e164)
          else leftovers.push(`${header}: ${piece}`)
        }
      } else {
        parts[target].push(cell)
        if (target === 'company') companyHeader = header
      }
    })

    const person = [parts.name.join(' '), parts.lastName.join(' ')]
      .filter(Boolean)
      .join(' ')
    const company = parts.company.join(' ')
    const email = parts.email[0] ?? ''
    const note = [
      ...parts.note,
      ...(person && company ? [`${companyHeader}: ${company}`] : []),
      ...leftovers,
    ].join('\n')
    const address = parts.address.join(', ')

    const hasData =
      person || company || phones.length || email || address || note
    if (!hasData && Object.keys(extra).length === 0) continue

    const name =
      person || company || (phones[0] ? formatPhone(phones[0]) : '') || email
    rows.push({
      name: clamp(name, MAX_NAME),
      kind: !person && company ? 'company' : undefined,
      phones,
      email: clamp(email, MAX_EMAIL),
      address: clamp(address, MAX_ADDRESS),
      note: clamp(note, MAX_NOTE),
      extra,
    })
  }
  return rows
}

type PickedContact = {
  name?: ReadonlyArray<string | undefined>
  tel?: ReadonlyArray<string | undefined>
}

/** Clients from the phone's contact picker. A contact with neither name nor number is dropped. */
export function rowsFromContacts(
  contacts: readonly PickedContact[],
): ImportRow[] {
  const rows: ImportRow[] = []
  for (const contact of contacts) {
    const name = contact.name?.[0]?.trim() ?? ''
    const phones: string[] = []
    const leftovers: string[] = []
    for (const tel of contact.tel ?? []) {
      const raw = tel?.trim()
      if (!raw) continue
      const e164 = normalizePhone(raw)
      if (!e164) leftovers.push(raw)
      else if (!phones.includes(e164) && phones.length < MAX_PHONES) {
        phones.push(e164)
      }
    }
    const fallback = phones[0] ? formatPhone(phones[0]) : (leftovers[0] ?? '')
    if (!name && !fallback) continue
    rows.push({
      name: clamp(name || fallback, MAX_NAME),
      phones,
      email: '',
      address: '',
      note: clamp(leftovers.join('\n'), MAX_NOTE),
      extra: {},
    })
  }
  return rows
}

// --------------------------------------------------------------- duplicates

/** A name as it is compared: Latin or Cyrillic, any case, one space between words. */
export function foldName(name: string): string {
  return transliterate(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' ')
}

/**
 * Each row's status. A repeated phone is a duplicate. The same name only is
 * one when the row has no phone to tell two people with that name apart.
 * "existing" wins over "inFile". Rows with no name at all can't be imported.
 */
export function rowStatuses(
  rows: readonly ImportRow[],
  existing: ExistingClients,
): RowStatus[] {
  const seenPhones = new Set<string>()
  const seenNames = new Set<string>()
  return rows.map((row) => {
    const folded = foldName(row.name)
    let status: RowStatus = 'ok'
    if (!row.name) status = 'noName'
    else if (row.phones.some((phone) => existing.phones.has(phone))) {
      status = 'existing'
    } else if (row.phones.length === 0 && existing.names.has(folded)) {
      status = 'existing'
    } else if (row.phones.some((phone) => seenPhones.has(phone))) {
      status = 'inFile'
    } else if (row.phones.length === 0 && seenNames.has(folded)) {
      status = 'inFile'
    }
    for (const phone of row.phones) seenPhones.add(phone)
    if (folded) seenNames.add(folded)
    return status
  })
}

/**
 * Whether a row with this status goes in. A row with no name never does;
 * repeats go in only when the person switched "skip duplicates" off.
 */
export function willImport(status: RowStatus, skipDuplicates: boolean) {
  if (status === 'ok') return true
  return status !== 'noName' && !skipDuplicates
}

// ------------------------------------------------------------------ preview

/** One column of the preview table. */
export type PreviewColumn =
  | { kind: 'name' | 'phone' | 'email' | 'address' | 'note' }
  | { kind: 'extra'; header: string }

/**
 * The columns the preview shows: the name, then each of phone, e-mail,
 * address and note that any row has, then every extra field in the order it
 * first appears. What no row holds would only be an empty column.
 */
export function previewColumns(rows: readonly ImportRow[]): PreviewColumn[] {
  const columns: PreviewColumn[] = [{ kind: 'name' }]
  if (rows.some((row) => row.phones.length > 0)) columns.push({ kind: 'phone' })
  if (rows.some((row) => row.email)) columns.push({ kind: 'email' })
  if (rows.some((row) => row.address)) columns.push({ kind: 'address' })
  if (rows.some((row) => row.note)) columns.push({ kind: 'note' })
  const headers = new Set<string>()
  for (const row of rows) {
    for (const [header, value] of Object.entries(row.extra)) {
      if (value) headers.add(header)
    }
  }
  for (const header of headers) columns.push({ kind: 'extra', header })
  return columns
}
