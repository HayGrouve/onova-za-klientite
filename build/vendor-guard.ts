import type { Plugin } from 'vite'

interface Chunk {
  type: 'chunk'
  name: string
  imports: string[]
  moduleIds: string[]
}

/**
 * Chunks the vendor chunk imports that hold app code. The vendor chunk only
 * keeps its hash across app changes (D104) while it imports nothing but other
 * library code, so any name returned here is a build error.
 */
export function vendorAppImports(
  bundle: Record<string, Chunk | { type: 'asset' }>,
): string[] {
  const chunks = Object.entries(bundle).filter(
    (entry): entry is [string, Chunk] => entry[1].type === 'chunk',
  )
  const vendor = chunks.find(([, chunk]) => chunk.name === 'vendor')?.[1]
  if (!vendor) return []
  const isApp = (id: string) =>
    !id.startsWith('\0') && !/[\\/]node_modules[\\/]/.test(id)
  return vendor.imports.filter((file) => {
    const chunk = bundle[file]
    return chunk?.type === 'chunk' && chunk.moduleIds.some(isApp)
  })
}

/** Fails the client build when the vendor chunk starts importing app code. */
export function vendorGuard(): Plugin {
  return {
    name: 'onova:vendor-guard',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      const app = vendorAppImports(bundle as never)
      if (app.length > 0) {
        this.error(
          `The vendor chunk imports app code (${app.join(', ')}); its hash would change with every app change. Check VENDOR_PACKAGES and APP_FACING in vite.config.ts.`,
        )
      }
    },
  }
}
