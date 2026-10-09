// Linking a job to the client's item from the "+" line: in "смяна на филтри
// Daikin", a word of the title names the client's Daikin unit.
import { foldName, plateFold } from './search'

/** An item as "+" sees it: its name and the folded words it is searched by (name, model, plate). */
export type ItemCandidate = { id: string; name: string; keys: string }

/** Words under this long are never read as naming an item. */
const MIN_WORD = 3

/** Words that join a thing to its purpose, left dangling when the item's name is taken out. */
const DANGLING = new Set([
  'на',
  'за',
  'от',
  'в',
  'във',
  'с',
  'със',
  'при',
  'по',
])

// "Дайкин" and "Daikin" meet: й and y are both read as i.
function fold(word: string) {
  return foldName(word).replace(/y/g, 'i').replace(/\s+/g, '')
}

function forms(word: string) {
  const out = new Set([fold(word)])
  if (/\d/.test(word)) out.add(fold(plateFold(word)))
  return [...out]
}

function edgeTrimmed(token: string) {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/**
 * The client's item the title names, and the title without the words that
 * name it. Nothing is picked when no word fits, or when two items fit equally
 * well. The words that name it come out of the title wherever they sit, with
 * a preposition left dangling at either end; when nothing would be left the
 * title is returned as written.
 */
export function matchItem(
  title: string,
  items: ItemCandidate[],
): { id: string; title: string } | null {
  const tokens = title.split(/\s+/).filter(Boolean)
  const tokenForms = tokens.map((token) => {
    const word = edgeTrimmed(token)
    return word.length >= MIN_WORD ? forms(word) : []
  })

  let best: { id: string; matched: boolean[]; score: number } | null = null
  let tie = false
  for (const item of items) {
    const keys = new Set(item.keys.split(/\s+/).filter(Boolean).map(fold))
    const matched = tokenForms.map((options) =>
      options.some((option) => keys.has(option)),
    )
    const score = matched.filter(Boolean).length
    if (score === 0) continue
    if (!best || score > best.score) {
      best = { id: item.id, matched, score }
      tie = false
    } else if (score === best.score) {
      tie = true
    }
  }
  if (!best || tie) return null

  // The words that name the item come out wherever they sit, then any
  // preposition left dangling at either end.
  const rest = tokens.filter((_, index) => !best.matched[index])
  const dangling = (token: string) =>
    DANGLING.has(edgeTrimmed(token).toLocaleLowerCase('bg'))
  while (rest.length > 0 && dangling(rest[rest.length - 1])) rest.pop()
  while (rest.length > 0 && dangling(rest[0])) rest.shift()
  const kept = rest.join(' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
  // Left with nothing: the title stays as written.
  return { id: best.id, title: kept || title }
}
