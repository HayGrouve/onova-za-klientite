# ADR 0003: Clerk for sign-in

**Status:** Superseded by [ADR 0012](./0012-shared-akaunt.md)

## Context

The design doc wants sign-in with Google or an email code, no passwords and no per-login cost. The sibling app already runs Clerk with Convex and a Bulgarian localization.

## Decision

- Clerk, with Google and email code as the only sign-in methods. Passwords and passkeys are off.
- Bulgarian UI through `bgBG` from `@clerk/localizations`, with local overrides for any gaps, as in the sibling.
- Convex verifies Clerk tokens through Clerk's Convex integration (`convex/auth.config.ts` with `applicationID: "convex"`), which needs no JWT template. `ConvexProviderWithClerk` picks the right token by itself ([Convex docs](https://docs.convex.dev/auth/clerk)).
- The `users` table is looked up by the token's `tokenIdentifier` (`issuer|subject`). It also stores the Clerk user id (`subject`) for Backend API calls, such as deleting the account.
- Previews and local dev use the Clerk development instance. Production uses a production instance on our own domain.
- E2E tests sign in with `@clerk/testing` and a `+clerk_test` user.

## Consequences

- Owners' sign-in data sits with Clerk, in the US. Client data stays in the EU Convex deployment ([ADR 0002](./0002-convex-in-the-eu.md)). Clerk's data processing terms need checking before public launch.
- Production Google sign-in needs our own Google OAuth client. That is a one-time step in Google Cloud that the owner has to do.
