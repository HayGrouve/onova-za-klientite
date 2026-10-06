import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { serviceWorker } from './build/service-worker.ts'

const isVitest = Boolean(process.env.VITEST)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '.worktrees/**'],
    // Convex function tests (`convex/*.test.ts`) run on convex-test.
    server: { deps: { inline: ['convex-test'] } },
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['baseLocale'],
      emitTsDeclarations: true,
    }),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    // Nitro's server runtime is for dev and build only. Under Vitest it loads
    // CJS React in an ESM runner and keeps the process alive.
    ...(isVitest
      ? []
      : [
          nitro({
            preset: 'vercel',
            routeRules: {
              '/**': {
                headers: {
                  'X-Frame-Options': 'DENY',
                  'X-Content-Type-Options': 'nosniff',
                  'Referrer-Policy': 'strict-origin-when-cross-origin',
                  'Permissions-Policy':
                    'camera=(self), microphone=(), geolocation=()',
                },
              },
            },
          }),
        ]),
    viteReact(),
    serviceWorker(),
  ],
})
