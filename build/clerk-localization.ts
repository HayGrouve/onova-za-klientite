import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'

/**
 * The parts of Clerk's translation the app never shows. It renders only the
 * `<SignIn>` card (email code and Google), so the profile, organization,
 * billing and similar screens are never drawn and cost bytes for nothing. A
 * missing key falls back to Clerk's English, which is what these screens
 * would show if they were ever added, so this is safe to extend.
 */
export const UNUSED_CLERK_SECTIONS = [
  'apiKeys',
  'billing',
  'configureDirectorySync',
  'configureSSO',
  'createOrganization',
  'oauthDeviceVerification',
  'organizationList',
  'organizationProfile',
  'organizationSwitcher',
  'reverification',
  'taskChooseOrganization',
  'taskSetupMfa',
  'userButton',
  'userProfile',
  'waitlist',
  'web3SolanaWalletButtons',
]

/** `value` without the unused sections and without keys Clerk left undefined. */
export function trimClerkLocalization(value: Record<string, unknown>) {
  // JSON drops the `undefined` placeholders in Clerk's translations.
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  for (const section of UNUSED_CLERK_SECTIONS) delete copy[section]
  return copy
}

const BULGARIAN = /[\\/]@clerk[\\/]localizations[\\/]dist[\\/]bg-BG\.mjs$/

/**
 * Replaces `@clerk/localizations/bg-BG` with the trimmed object in the
 * production build, so the translations of screens the app never draws
 * stay out of the entry chunk.
 */
export function trimClerkBundle(): Plugin {
  return {
    name: 'onova:clerk-localization',
    apply: 'build',
    async load(id) {
      if (!BULGARIAN.test(id)) return null
      const module = (await import(pathToFileURL(id).href)) as {
        bgBG: Record<string, unknown>
      }
      return `export const bgBG = ${JSON.stringify(trimClerkLocalization(module.bgBG))}`
    },
  }
}
