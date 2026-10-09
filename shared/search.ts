// Search keys (implementation plan → Search, D8, D40). The stored shape is one
// space-separated string per record; a query is folded the same way.

const CYRILLIC = /\p{Script=Cyrillic}/u

const CYRILLIC_TO_LATIN: Partial<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sht',
  ъ: 'a',
  ь: 'y',
  ю: 'yu',
  я: 'ya',
}

/** Иван → ivan. Latin passes through, lower-cased and without accents. */
export function transliterate(text: string): string {
  // Decompose first so accented letters (ѝ, é) fold to their base letter.
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
  let out = ''
  for (const char of base) {
    const latin = CYRILLIC_TO_LATIN[char]
    if (latin !== undefined) out += latin
    else if (!CYRILLIC.test(char)) out += char
  }
  return out
}

function words(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter(Boolean)
}

/**
 * One spelling for the Latin forms of a name, applied to a transliterated
 * word on both sides: the stored keys and the query. Cyrillic gives one
 * transliteration but people type several (Maria, Mariya, Mariia), so the
 * spellings are folded together and each word still makes one key. It is
 * lossy on purpose and never shown. It reads left to right, so a half-typed
 * word folds like the start of the whole one, except where the ending
 * decides (Peter → Petar).
 */
function spelling(word: string): string {
  return (
    word
      // Christo, Xristo, Khristo → Hristo
      .replace(/^chr/, 'hr')
      .replace(/^x/, 'h')
      // Alexander → Aleksander
      .replace(/x/g, 'ks')
      .replace(/kh/g, 'h')
      // Tsvetan, Tzvetan → Cvetan
      .replace(/t[sz]/g, 'c')
      .replace(/w/g, 'v')
      // The vowel Cyrillic writes as ъ: Peter, Petur, Petyr → Petar
      .replace(/[eyu]r$/, 'ar')
      // Jivko → Zhivko, but Jordan, Julia and Jana start with Y
      .replace(/j(?=[ie])/g, 'zh')
      // Y, J and I are one sound: Nikolay, Stoian, Mariia, Iordan
      .replace(/[yj]/g, 'i')
      .replace(/i{2,}/g, 'i')
      // Lyubomir → Lubomir, Yulia → Ulia
      .replace(/iu/g, 'u')
  )
}

// The 12 letters Bulgarian plates share with Latin (А В Е К М Н О Р С Т У Х).
const PLATE_LOOKALIKES: Partial<Record<string, string>> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
}

/** СА 1234 ВР → ca 1234 bp: look-alike letters read as the Latin they look like. */
export function plateFold(text: string): string {
  let out = ''
  for (const char of text.toLowerCase()) out += PLATE_LOOKALIKES[char] ?? char
  return transliterate(out)
}

/** Convex search silently drops terms over 32 bytes; keys are Latin, so 32 characters. */
const MAX_KEY = 32
/** A guard, so one very long note can't flood a record's keys. */
const MAX_KEYS = 512
/** Values this short also get a copy without spaces: plates, model numbers. */
const SPACELESS_UP_TO = 20
/** A phone is found by any run of its digits this long or longer. */
const MIN_PHONE_RUN = 4

/** A value read as words only, even with digits in it: an address. */
export type PlainValue = { plain: string }
export type SearchValue = string | PlainValue | undefined

/**
 * The keys of a phone in international form (+359899314159), besides its
 * digits as one word: the local 0… form of a Bulgarian number, and every
 * ending of the number without its country code that is 4 digits or more
 * (899314159, 99314159, … 4159). Convex search matches whole words but takes
 * the last query word as a prefix, so a prefix of an ending is any run of
 * digits from the middle, while the last digits and the number without its 0
 * are endings themselves. A Bulgarian mobile gets 7 keys this way, a
 * landline 6. Other countries' codes are 1 to 3 digits, so their endings
 * start after the first digit and a key or two may begin inside the code.
 */
function phoneKeys(phone: string): string[] {
  const digits = phone.slice(1)
  const bulgarian = /^\+359\d{8,9}$/.test(phone)
  const keys = bulgarian ? [`0${digits.slice(3)}`] : []
  const first = bulgarian ? 3 : 1
  for (let from = first; from <= digits.length - MIN_PHONE_RUN; from++)
    keys.push(digits.slice(from))
  return keys
}

/** One folded key string for a record, built from its searchable values. */
export function buildSearchText(values: SearchValue[]): string {
  const keys = new Set<string>()
  const add = (key: string) => {
    if (key && keys.size < MAX_KEYS) keys.add(key.slice(0, MAX_KEY))
  }
  for (const value of values) {
    if (!value) continue
    const text = typeof value === 'string' ? value : value.plain
    // Plates and model numbers have digits: they also get the look-alike
    // fold and a copy without spaces. Plain names stay plain, and so does an
    // address, whatever digits it holds.
    const codeLike = typeof value === 'string' && /\d/.test(value)
    const folds = new Set([
      transliterate(text),
      ...(codeLike ? [plateFold(text)] : []),
    ])
    for (const fold of folds) {
      for (const word of words(fold)) add(spelling(word))
      const compact = fold.replace(/[^\p{L}\p{N}]+/gu, '')
      if (
        codeLike &&
        compact.length <= SPACELESS_UP_TO &&
        words(fold).length > 1
      )
        add(compact)
    }
    // A phone in international form is also typed the local way
    // (+359888… → 0888…), without its 0, and by its last digits.
    const phone = text.replace(/[\s()-]/g, '')
    if (/^\+\d{8,15}$/.test(phone)) {
      for (const key of phoneKeys(phone)) add(key)
    }
  }
  return [...keys].join(' ')
}

/**
 * A search box query, folded like the stored keys. A query with digits also
 * gets a compact look-alike form, so "СА 1234 ВР" finds "CA1234BP" and a
 * phone typed in groups finds its digits. Search runs each variant and
 * merges the results.
 */
export function foldQuery(query: string): string[] {
  const plain = words(transliterate(query))
    .map((word) => spelling(word).slice(0, MAX_KEY))
    .join(' ')
  if (!/\d/.test(query)) return plain ? [plain] : []
  const compact = plateFold(query)
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, MAX_KEY)
  return [...new Set([plain, compact].filter(Boolean))]
}

/**
 * A fold for matching names: transliterated, with the Latin spellings people
 * mix up made equal (x/h, w/v, c/ts, y/i, Maria/Mariya). Words only.
 */
export function foldName(text: string): string {
  return words(transliterate(text)).map(spelling).join(' ')
}

/** Every query word starts a word of the name. "iv pet" finds "Иван Петров". */
export function nameMatches(query: string, name: string): boolean {
  const q = foldName(query)
  if (!q) return false
  const nameWords = foldName(name).split(' ')
  return q
    .split(' ')
    .every((part) => nameWords.some((word) => word.startsWith(part)))
}

/**
 * Whether a query finds a record the way Convex search does, in memory: its
 * folded words against the record's stored keys, which are taken as they are
 * and never folded again. Every term but the last must be a whole key, the
 * last one the start of a key. A query with digits also has its compact form,
 * and matching either variant is a match (search runs each and merges).
 */
export function keysMatch(query: string, searchText: string): boolean {
  const keys = new Set(searchText.split(' ').filter(Boolean))
  return foldQuery(query).some((variant) => {
    const terms = variant.split(' ')
    const last = terms.pop()!
    return (
      terms.every((term) => keys.has(term)) &&
      [...keys].some((key) => key.startsWith(last))
    )
  })
}

export function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

export type ClientCandidate = { id: string; name: string; phones: string[] }

/** A row of the clients list (its first phone only) as search reads it. */
export function asCandidate<
  T extends { _id: string; name: string; phone?: string },
>(client: T): T & ClientCandidate {
  return {
    ...client,
    id: client._id,
    phones: client.phone ? [client.phone] : [],
  }
}

/** Clients whose name matches, or whose phone holds the typed digits (3 or more). */
export function searchClients<T extends ClientCandidate>(
  clients: T[],
  query: string,
  limit = 5,
): T[] {
  const q = query.trim()
  if (!q) return []
  const digits = digitsOf(q)
  const byPhone =
    digits.length >= 3 && digits.length >= q.replace(/\s/g, '').length - 1
  return clients
    .filter(
      (client) =>
        nameMatches(q, client.name) ||
        (byPhone &&
          client.phones.some((phone) =>
            digitsOf(phone).includes(digits.replace(/^0/, '')),
          )),
    )
    .slice(0, limit)
}

/** Edits to turn one string into the other; swapping two neighbours counts as one. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ])
  for (let j = 1; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }
  return rows[a.length][b.length]
}

/**
 * Clients whose name is a typo or two from a typed one ("Иван Петрв" for
 * "Иван Петров"), closest first. Short names allow fewer edits, so "Ана"
 * never finds "Аня". A single typed word is also read against each word of a
 * name.
 */
export function similarClients<T extends ClientCandidate>(
  clients: T[],
  query: string,
  limit = 3,
): T[] {
  const typed = foldName(query)
  const allowed = typed.length >= 8 ? 2 : typed.length >= 5 ? 1 : 0
  if (allowed === 0) return []
  const single = !typed.includes(' ')
  return clients
    .map((client) => {
      const name = foldName(client.name)
      const distance = Math.min(
        editDistance(typed, name),
        ...(single
          ? name.split(' ').map((word) => editDistance(typed, word))
          : []),
      )
      return { client, distance }
    })
    .filter(({ distance }) => distance <= allowed)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ client }) => client)
}
