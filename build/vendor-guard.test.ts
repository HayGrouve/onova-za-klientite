import { describe, expect, it } from 'vitest'
import { vendorAppImports } from './vendor-guard.ts'

const chunk = (name: string, imports: string[], moduleIds: string[]) => ({
  type: 'chunk' as const,
  name,
  imports,
  moduleIds,
})

describe('vendorAppImports', () => {
  it('passes a vendor chunk that imports only library code', () => {
    expect(
      vendorAppImports({
        'vendor.js': chunk('vendor', ['runtime.js'], []),
        'runtime.js': chunk('runtime', [], ['\0rolldown/runtime.js']),
        'lib.js': chunk('lib', [], ['/x/node_modules/react/index.js']),
      }),
    ).toEqual([])
  })

  it('names a chunk with app code that the vendor chunk imports', () => {
    expect(
      vendorAppImports({
        'vendor.js': chunk('vendor', ['index.js', 'runtime.js'], []),
        'index.js': chunk('index', [], ['/repo/src/router.tsx']),
        'runtime.js': chunk('runtime', [], ['\0rolldown/runtime.js']),
      }),
    ).toEqual(['index.js'])
  })

  it('has nothing to check without a vendor chunk', () => {
    expect(vendorAppImports({ 'a.css': { type: 'asset' } })).toEqual([])
  })
})
