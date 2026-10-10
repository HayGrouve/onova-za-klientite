/** The shell TanStack Start prerenders in SPA mode (ADR 0010). */
export const SHELL = '/_shell.html'

/**
 * Unhashed files the shell needs. They sit in the small versioned shell cache
 * and are fetched fresh on every install.
 */
export const SHELL_PUBLIC_FILES = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
]

/**
 * Source files whose chunks (with everything they import statically) the
 * offline view needs besides the entry: the signed-in layout and the screen
 * at the app's start URL, and the read-only snapshot view. Every other chunk
 * is cached the first time the browser asks for it.
 */
export const OFFLINE_ROOTS = [
  '/src/routes/_app.tsx',
  '/src/routes/_app/index.tsx',
  '/src/components/offline/offline-app.tsx',
]

/**
 * Font files the offline view needs. Bulgarian text is Cyrillic plus the
 * Latin subset (digits, punctuation, the euro sign). The other subsets are
 * cached when a page really uses them.
 */
export const OFFLINE_FONT = /onest-(cyrillic|latin)-wght-normal-[\w-]+\.woff2$/

/** The part of Rollup's output that the plan reads. */
export type BundleFile =
  | {
      type: 'chunk'
      fileName: string
      isEntry: boolean
      imports: string[]
      moduleIds: string[]
      viteMetadata?: {
        importedCss: Set<string>
        importedAssets: Set<string>
      }
    }
  | { type: 'asset'; fileName: string; source: string | Uint8Array }

export type PrecachePlan = {
  /** Every hashed file of this build, so the worker knows what is still valid. */
  assets: string[]
  /** The hashed files cached on install. */
  precache: string[]
}

export function planPrecache(bundle: Record<string, BundleFile>): PrecachePlan {
  const files = Object.values(bundle).filter(
    (file) => !file.fileName.endsWith('.map'),
  )
  const chunks = new Map<string, Extract<BundleFile, { type: 'chunk' }>>()
  for (const file of files)
    if (file.type === 'chunk') chunks.set(file.fileName, file)

  const roots = new Set<string>()
  for (const chunk of chunks.values())
    if (chunk.isEntry) roots.add(chunk.fileName)
  for (const source of OFFLINE_ROOTS) {
    const matches = [...chunks.values()].filter((chunk) =>
      chunk.moduleIds.some((id) => id.includes(source)),
    )
    if (matches.length === 0) {
      throw new Error(
        `Service worker: no chunk contains ${source}. Update OFFLINE_ROOTS in build/precache-plan.ts.`,
      )
    }
    for (const chunk of matches) roots.add(chunk.fileName)
  }

  const precache = new Set<string>()
  const visit = (name: string) => {
    if (precache.has(name)) return
    const chunk = chunks.get(name)
    if (!chunk) return
    precache.add(name)
    for (const next of chunk.imports) visit(next)
    for (const css of chunk.viteMetadata?.importedCss ?? []) precache.add(css)
    for (const asset of chunk.viteMetadata?.importedAssets ?? [])
      precache.add(asset)
  }
  for (const root of roots) visit(root)

  // The stylesheet is loaded with a <link> (`?url`), so no chunk imports it.
  for (const file of files) {
    if (file.type === 'asset' && file.fileName.endsWith('.css'))
      precache.add(file.fileName)
  }

  // Fonts: keep the offline subsets, leave the others to the runtime cache.
  for (const name of [...precache]) {
    if (/\.woff2?$/.test(name) && !OFFLINE_FONT.test(name))
      precache.delete(name)
  }
  for (const file of files) {
    if (OFFLINE_FONT.test(file.fileName)) precache.add(file.fileName)
  }

  const assets = files.map((file) => '/' + file.fileName).sort()
  return {
    assets,
    precache: [...precache].map((file) => '/' + file).sort(),
  }
}
