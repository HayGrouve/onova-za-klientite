# ADR 0004: Vercel hosting, with a Convex deployment per preview

**Status:** Proposed. Vercel is linked only after milestone 1 is merged.

## Context

The owner wants every PR to have a Vercel preview backed by its own Convex preview deployment, if the plan allows it. Convex preview deployments are available on every plan (beta). They live 5 days on Free/Starter and 14 on Pro, and count toward the team's deployment cap. The sibling app has no previews and deploys production from GitHub Actions.

## Decision

- The Vercel build command is `npx convex deploy --cmd 'pnpm build' --preview-run 'seed:preview'` ([source](https://docs.convex.dev/production/hosting/vercel)).
- `CONVEX_DEPLOY_KEY` is set twice in Vercel. The Production scope gets the production deploy key, and the Preview scope gets a preview deploy key. The CLI refuses a production key in a preview build.
- Each preview branch gets its own Convex deployment, seeded with the two test businesses by an idempotent `seed:preview`.
- Preview env defaults are set once from the CLI, for example `npx convex env default set CLERK_JWT_ISSUER_DOMAIN <dev-issuer> --type preview`. Previews use the Clerk **development** instance, because Clerk production doesn't accept `*.vercel.app`.
- Vercel functions run in `dub1` (Dublin), next to Convex in Ireland.

## Consequences

- **Merging to `main` deploys production**, Convex first and then the app, in one Vercel build. So the owner's merge approval is also the production deploy approval. The first production deploy happens with the owner present, right after linking.
- Until launch, "production" is the disposable Free-plan deployment from [ADR 0002](./0002-convex-in-the-eu.md). At launch only the Production-scoped `CONVEX_DEPLOY_KEY` changes, to point at the fresh EU deployment.
- A preview deployment is reused per branch and expires after 5 days on Free/Starter. Pushing again recreates it.
- If the owner prefers the sibling's model (production only from GitHub Actions, with Vercel Git production deploys off), only the production half changes; previews stay as above.
