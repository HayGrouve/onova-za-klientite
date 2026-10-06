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
