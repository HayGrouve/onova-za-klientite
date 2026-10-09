import { describe, expect, it } from 'vitest'
import { planPrecache } from './precache-plan.ts'
import type { BundleFile } from './precache-plan.ts'

function chunk(
  name: string,
  options: {
    entry?: boolean
    imports?: string[]
    modules?: string[]
    assets?: string[]
  } = {},
): BundleFile {
  return {
    type: 'chunk',
    fileName: `assets/${name}`,
    isEntry: options.entry ?? false,
    imports: (options.imports ?? []).map((file) => `assets/${file}`),
    moduleIds: options.modules ?? [],
    viteMetadata: {
      importedCss: new Set(),
      importedAssets: new Set(options.assets ?? []),
    },
  }
}

function asset(name: string): BundleFile {
  return { type: 'asset', fileName: `assets/${name}`, source: '' }
}

function bundleOf(files: BundleFile[]) {
  return Object.fromEntries(files.map((file) => [file.fileName, file]))
}

const FONTS = [
  'sofia-sans-cyrillic-wght-normal-aaa.woff2',
  'sofia-sans-greek-wght-normal-bbb.woff2',
  'sofia-sans-latin-ext-wght-normal-ccc.woff2',
  'sofia-sans-latin-wght-normal-ddd.woff2',
]

const OFFLINE_MODULES = [
  chunk('layout-1.js', { modules: ['/repo/src/routes/_app.tsx'] }),
  chunk('today-1.js', { modules: ['/repo/src/routes/_app/index.tsx?x'] }),
  chunk('offline-1.js', {
    modules: ['/repo/src/components/offline/offline-app.tsx'],
    imports: ['shared-1.js'],
  }),
  chunk('shared-1.js'),
]

describe('planPrecache', () => {
  it('keeps the entry graph and the offline view, and leaves lazy chunks out', () => {
    const plan = planPrecache(
      bundleOf([
        chunk('index-1.js', { entry: true, imports: ['react-1.js'] }),
        chunk('react-1.js'),
        ...OFFLINE_MODULES,
        chunk('satori-1.js', { imports: ['react-1.js'] }),
        chunk('xlsx-1.js'),
        asset('styles-1.css'),
        ...FONTS.map(asset),
      ]),
    )
    expect(plan.precache).toEqual([
      '/assets/index-1.js',
      '/assets/layout-1.js',
      '/assets/offline-1.js',
      '/assets/react-1.js',
      '/assets/shared-1.js',
      '/assets/sofia-sans-cyrillic-wght-normal-aaa.woff2',
      '/assets/sofia-sans-latin-wght-normal-ddd.woff2',
      '/assets/styles-1.css',
      '/assets/today-1.js',
    ])
    // The worker still knows every file as valid.
    expect(plan.assets).toContain('/assets/satori-1.js')
    expect(plan.assets).toContain(
      '/assets/sofia-sans-greek-wght-normal-bbb.woff2',
    )
    expect(plan.assets).toHaveLength(13)
  })

  it('drops source maps and font subsets a chunk imports as assets', () => {
    const plan = planPrecache(
      bundleOf([
        chunk('index-1.js', {
          entry: true,
          assets: [`assets/${FONTS[1]}`, `assets/${FONTS[0]}`],
        }),
        ...OFFLINE_MODULES,
        ...FONTS.map(asset),
        asset('index-1.js.map'),
      ]),
    )
    expect(plan.precache).not.toContain(`/assets/${FONTS[1]}`)
    expect(plan.precache).toContain(`/assets/${FONTS[0]}`)
    expect(plan.assets).not.toContain('/assets/index-1.js.map')
  })

  it('fails the build when an offline source file is not in any chunk', () => {
    expect(() =>
      planPrecache(bundleOf([chunk('index-1.js', { entry: true })])),
    ).toThrow('/src/routes/_app.tsx')
  })
})
