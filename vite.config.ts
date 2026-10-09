import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { trimClerkBundle } from './build/clerk-localization.ts'
import { serviceWorker } from './build/service-worker.ts'
import { vendorGuard } from './build/vendor-guard.ts'

const isVitest = Boolean(process.env.VITEST)

/**
 * Enforced (D108). The Clerk host is the development instance's; the
 * production instance needs its own (`clerk.<domain>`) at launch (D50).
 * `'wasm-unsafe-eval'` (WebAssembly only, not `eval`) and `data:` in
 * `connect-src` are for satori's layout engine in the job summary, which
 * compiles a wasm module it carries as a data URL. `blob:` lets the page
 * read back what it made itself (the summary PNG, picked or converted files).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://img.clerk.com https://*.convex.cloud",
  "connect-src 'self' data: blob: https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://clerk-telemetry.com",
  'frame-src https://challenges.cloudflare.com https://*.clerk.accounts.dev',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * The libraries the app always loads and rarely upgrades. They go in one
 * `vendor` chunk of their own, so an app-code change leaves its hash alone and
 * the service worker (ADR 0010) doesn't download them again. Everything loaded
 * on demand (satori, the spreadsheet and CSV readers, the zip writer, the full
 * phone metadata) is left out on purpose and stays in its own lazy chunk.
 */
const VENDOR_PACKAGES = [
  'react',
  'react-dom',
  'scheduler',
  '@clerk/',
  'convex',
  '@tanstack/',
  'seroval',
  'seroval-plugins',
  'sonner',
  'libphonenumber-js',
  '@base-ui/',
  '@floating-ui/',
  'use-sync-external-store',
  'dequal',
]

/**
 * Start's own client packages import the app (its router and entry), so they
 * stay with the app code; a vendor chunk that imports the app would change
 * hash whenever the app does.
 */
const APP_FACING = [
  '@tanstack/start-client-core',
  '@tanstack/react-start',
  '@clerk/tanstack-react-start',
]

function isVendor(id: string) {
  const match =
    /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(@[^\\/]+[\\/][^\\/]+|[^\\/]+)[\\/]/.exec(
      id,
    )
  const name = match?.[1]?.replaceAll('\\', '/')
  if (!name) return false
  if (APP_FACING.some((pkg) => name.startsWith(pkg))) return false
  // The full phone metadata is only for lazy chunks.
  if (name === 'libphonenumber-js' && /metadata\.max|[\\/]max[\\/]/.test(id))
    return false
  return VENDOR_PACKAGES.some((pkg) =>
    pkg.endsWith('/') ? name.startsWith(pkg) : name === pkg,
  )
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  name: 'vendor',
                  test: isVendor,
                  includeDependenciesRecursively: false,
                  tags: ['$initial'],
                },
              ],
            },
          },
        },
      },
    },
  },
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
    trimClerkBundle(),
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
                  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
                },
              },
            },
          }),
        ]),
    viteReact(),
    serviceWorker(),
    vendorGuard(),
  ],
})
