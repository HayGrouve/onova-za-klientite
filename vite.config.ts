import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { serviceWorker } from './build/service-worker.ts'

const isVitest = Boolean(process.env.VITEST)

/**
 * Report-only for now (D91): browsers log what it would block and send
 * nothing anywhere. It becomes enforcing after a clean period. The Clerk host
 * is the development instance's; the production instance needs its own
 * (`clerk.<domain>`) at launch.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://img.clerk.com https://*.convex.cloud",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://clerk-telemetry.com",
  'frame-src https://challenges.cloudflare.com https://*.clerk.accounts.dev',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

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
                  'Content-Security-Policy-Report-Only':
                    CONTENT_SECURITY_POLICY,
                },
              },
            },
          }),
        ]),
    viteReact(),
    serviceWorker(),
  ],
})
