import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import {
  clerkFrontendHost,
  contentSecurityPolicy,
} from './build/content-security-policy.ts'
import { trimClerkBundle } from './build/clerk-localization.ts'
import { serviceWorker } from './build/service-worker.ts'
import { vendorGuard } from './build/vendor-guard.ts'

const isVitest = Boolean(process.env.VITEST)

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

/**
 * The CSP is enforced (D108). Its Clerk host comes from the publishable key
 * the build is given (D111), so the production instance needs no edit.
 */
export default defineConfig(({ mode }) => {
  const { VITE_CLERK_PUBLISHABLE_KEY } = loadEnv(mode, process.cwd(), 'VITE_')
  // On Vercel the key is always there (the app can't sign in without it), so
  // a key the CSP can't read means the policy would fall back to the dev
  // instance's hosts and block sign-in: fail the build instead.
  if (process.env.VERCEL && !clerkFrontendHost(VITE_CLERK_PUBLISHABLE_KEY)) {
    throw new Error(
      'VITE_CLERK_PUBLISHABLE_KEY is missing or unreadable: the CSP would block Clerk.',
    )
  }
  const CONTENT_SECURITY_POLICY = contentSecurityPolicy(
    VITE_CLERK_PUBLISHABLE_KEY,
  )
  return {
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
  }
})
