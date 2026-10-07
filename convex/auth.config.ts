import type { AuthConfig } from 'convex/server'

export default {
  providers: [
    {
      // Auth config is read at push time, before the typed `env` exists.
      // eslint-disable-next-line @convex-dev/no-process-env
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig
