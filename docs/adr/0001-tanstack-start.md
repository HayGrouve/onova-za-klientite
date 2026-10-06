# ADR 0001: TanStack Start for the app

**Status:** Accepted

## Context

The app is a phone-first PWA with a signed-in shell, about a dozen screens and no public marketing pages yet. The sibling app (`onova-za-smetkata`) already runs TanStack Start on Vercel with Convex and Clerk, and its setup is proven.

## Decision

- TanStack Start (Vite, React 19, strict TypeScript) at the repo root, with file routes in `src/routes/`.
- SPA mode (`spa: { enabled: true }`). Every screen is behind sign-in, so server rendering gains nothing, and the static `/_shell.html` is what makes the app open offline ([ADR 0010](./0010-offline-read-cache.md)).
- Nitro with the `vercel` preset for the build, skipped under Vitest.
- All data rules live in Convex. The TanStack server only renders the shell and runs `clerkMiddleware()`; there are no server functions with business logic.

## Consequences

- Route guards are client-side, as in the sibling. Real authorization is in Convex ([ADR 0006](./0006-business-is-the-auth-scope.md)).
- `src/routeTree.gen.ts` is generated and committed, never edited by hand.
