import { describe, expect, it } from 'vitest'
import messages from '../../messages/bg.json'

// Design doc, "Names and Bulgarian grammar": renamable nouns (the business's
// own words) never follow a gendered adjective or a number. A rename to
// "Ремонт" must read right everywhere.
const WORD =
  /\{(job|jobs|client|clients|item|items|appointment|appointments|label)\}/g

// What may stand right before a business word: nothing, a sign, a verb or a
// preposition that doesn't agree with the noun's gender.
const ALLOWED_BEFORE = new Set([
  '',
  '+',
  'Добави',
  'Добави:',
  'вашите',
  'от',
  'за',
  'на',
  'в',
])

describe('Bulgarian grammar around renamable words', () => {
  const entries = Object.entries(messages).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )

  it('no gendered adjective or number comes right before a business word', () => {
    const offenders: string[] = []
    for (const [key, text] of entries) {
      for (const match of text.matchAll(WORD)) {
        const before =
          text.slice(0, match.index).trim().split(/\s+/).at(-1) ?? ''
        if (!ALLOWED_BEFORE.has(before)) offenders.push(`${key}: "${text}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('counts read "{Jobs}: 5", never "5 {jobs}"', () => {
    const offenders = entries
      .filter(([, text]) =>
        /\{count\}\s*\{(job|client|item|appointment)s?\}/.test(text),
      )
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })
})
