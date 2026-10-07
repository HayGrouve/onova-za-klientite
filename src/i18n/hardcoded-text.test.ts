import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cyrillicLines } from './hardcoded-text'

const SRC = join(import.meta.dirname, '..')
const SKIP = new Set(['paraglide', 'routeTree.gen.ts'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('hard-coded UI text', () => {
  it('finds a planted Bulgarian string', () => {
    const planted = `export const Title = () => <h1>Нова поръчка</h1>`
    expect(cyrillicLines(`const a = 1\n${planted}`)).toEqual([2])
  })

  it('has no Cyrillic in src/ outside the translation files', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      cyrillicLines(readFileSync(file, 'utf8')).map(
        (line) => `${relative(SRC, file)}:${line}`,
      ),
    )
    expect(offenders).toEqual([])
  })
})
