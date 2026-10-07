// Search keys (implementation plan → Search). Milestone 8 extends the fold;
// the stored shape stays one space-separated string per record.

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
/** Values this short also get a copy without spaces: plates, model numbers. */
const SPACELESS_UP_TO = 20

/** One folded key string for a record, built from its searchable values. */
export function buildSearchText(values: Array<string | undefined>): string {
  const keys = new Set<string>()
  const add = (key: string) => {
    if (key) keys.add(key.slice(0, MAX_KEY))
  }
  for (const value of values) {
    if (!value) continue
    // Plates and model numbers have digits: they also get the look-alike
    // fold and a copy without spaces. Plain names stay plain.
    const codeLike = /\d/.test(value)
    const folds = new Set([
      transliterate(value),
      ...(codeLike ? [plateFold(value)] : []),
    ])
    for (const fold of folds) {
      for (const word of words(fold)) add(word)
      const compact = fold.replace(/[^\p{L}\p{N}]+/gu, '')
      if (
        codeLike &&
        compact.length <= SPACELESS_UP_TO &&
        words(fold).length > 1
      )
        add(compact)
    }
    // A phone in international form is also typed the local way: +359888… → 0888…
    const phone = value.replace(/[\s()-]/g, '')
    if (/^\+359\d{8,9}$/.test(phone)) add(`0${phone.slice(4)}`)
  }
  return [...keys].join(' ')
}

/**
 * A search box query, folded like the stored keys. A query with digits also
 * gets a compact look-alike form, so "СА 1234 ВР" finds "CA1234BP". Search
 * runs each variant and merges the results.
 */
export function foldQuery(query: string): string[] {
  const plain = words(transliterate(query)).join(' ')
  if (!/\d/.test(query)) return plain ? [plain] : []
  const compact = plateFold(query)
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, MAX_KEY)
  return [...new Set([plain, compact].filter(Boolean))]
}

/**
 * A query-side fold for matching names: transliterated, with the Latin
 * spellings people mix up made equal (x/h, w/v, c/ts).
 */
export function foldName(text: string): string {
  return transliterate(text)
    .replace(/x/g, 'h')
    .replace(/w/g, 'v')
    .replace(/c(?!h)/g, 'ts')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

export function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

export type ClientCandidate = { id: string; name: string; phones: string[] }

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
