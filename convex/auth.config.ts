import type { AuthConfig } from 'convex/server'

// Auth config is read at push time, before the typed `env` exists. A custom
// JWT provider compares `iss` exactly, and Clerk's has no trailing slash.
// eslint-disable-next-line @convex-dev/no-process-env
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN!.replace(/\/+$/, '')

// `customJwt` rather than Clerk's built-in provider, because only a custom JWT
// provider passes every claim through, `azp` among them (ADR 0012). The
// session token carries `aud: "convex"`.
export default {
  providers: [
    {
      type: 'customJwt',
      issuer,
      jwks: `${issuer}/.well-known/jwks.json`,
      algorithm: 'RS256',
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig
