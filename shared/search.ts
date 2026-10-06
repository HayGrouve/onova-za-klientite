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

/** One folded key string for a record, built from its searchable values. */
export function buildSearchText(values: Array<string | undefined>): string {
  const keys = new Set<string>()
  for (const value of values) {
    if (!value) continue
    for (const word of words(transliterate(value))) keys.add(word)
  }
  return [...keys].join(' ')
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
  const words = foldName(name).split(' ')
  return q
    .split(' ')
    .every((part) => words.some((word) => word.startsWith(part)))
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
