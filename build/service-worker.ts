import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { planPrecache, SHELL, SHELL_PUBLIC_FILES } from './precache-plan.ts'
import type { BundleFile } from './precache-plan.ts'
import { workerSource } from './worker-source.ts'

/**
 * Emits `/sw.js` with the client build's file list. A small hand-written
 * worker instead of vite-plugin-pwa, which doesn't support the Vite
 * Environment API that Start builds on.
 */
export function serviceWorker(): Plugin {
  return {
    name: 'onova:service-worker',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      const publicDir = this.environment.config.publicDir
      const shellHash = createHash('sha256')
      for (const file of SHELL_PUBLIC_FILES) {
        const path = publicDir ? join(publicDir, file) : ''
        if (!path || !existsSync(path)) {
          this.error(`Service worker: public${file} is missing.`)
        }
        shellHash.update(file).update(readFileSync(path))
      }
      const { assets, precache } = planPrecache(
        bundle as unknown as Record<string, BundleFile>,
      )
      // Any change to a hashed file or to the shell files makes a new worker.
      const version = createHash('sha256')
        .update(assets.join('\n'))
        .update(shellHash.digest())
        .digest('hex')
        .slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: workerSource({
          version,
          shell: SHELL,
          shellFiles: SHELL_PUBLIC_FILES,
          assets,
          precache,
        }),
      })
    },
  }
}
