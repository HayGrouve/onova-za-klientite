import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dashLines } from './dashes'

const SRC = join(import.meta.dirname, '..')
const MESSAGES = join(SRC, '..', 'messages', 'bg.json')
const SKIP = new Set(['paraglide', 'routeTree.gen.ts'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('em and en dashes in UI text', () => {
  it('finds a planted dash in a string, a template and JSX text', () => {
    const source = [
      `const a = cents > 0 ? money(cents) : '–'`,
      '// a comment may say 1–2',
      'const b = `${n}—`',
      'export const C = () => <p>Посещение –</p>',
      '/* 0–23 */ const d = 1',
    ].join('\n')
    expect(dashLines(source)).toEqual([1, 3, 4])
  })

  it('has none in src/ outside tests and comments', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      dashLines(readFileSync(file, 'utf8'), file).map(
        (line) => `${relative(SRC, file)}:${line}`,
      ),
    )
    expect(offenders).toEqual([])
  })

  it('has none in the translations', () => {
    const messages = JSON.parse(readFileSync(MESSAGES, 'utf8')) as Record<
      string,
      unknown
    >
    const offenders = Object.entries(messages)
      .filter(
        ([, text]) => typeof text === 'string' && /[\u2013\u2014]/.test(text),
      )
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })
})
