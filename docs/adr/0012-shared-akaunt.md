# ADR 0012: Sign-in through the shared Акаунт

**Status:** Accepted. Supersedes [ADR 0003](./0003-clerk-sign-in.md).

## Context

Every онова за project with sign-in moves onto one shared Акаунт: a single Clerk production application ("онова за") on onovaza.com, with each project on its own subdomain ([hub ADR 0001](https://github.com/HayGrouve/onova-za/blob/main/docs/adr/0001-one-akaunt-on-onovaza-subdomains.md)). ADR 0003 gave this app its own Clerk application, its own sign-in page with the `bgBG` localization, users keyed by `tokenIdentifier`, and deletion of the Clerk user from Convex. All four conflict with a shared Акаунт: the sign-in page lives on the hub, `tokenIdentifier` changes with the issuer, and deleting the Clerk user here would delete the person's Акаунт in every project.

The migration plan is [HayGrouve/onova-za#33](https://github.com/HayGrouve/onova-za/issues/33) (Resolution, decisions 1 to 22), built on the [code map](https://github.com/HayGrouve/onova-za/blob/research/klientite-code-map/docs/research/akaunt/klientite-code-map.md) ([HayGrouve/onova-za#39](https://github.com/HayGrouve/onova-za/issues/39)).

## Decision

- **Вход through the Акаунт.** Production signs in at `https://onovaza.com/vhod`, the hub's one sign-in page. No Clerk UI renders in this app. The sign-in URL comes from env (`VITE_CLERK_SIGN_IN_URL`), never a hard-coded prop, and is unset on dev and previews, which use the dev instance's Account Portal. `/login` stays only as a redirect to sign-in, for bookmarks and installed copies. A signed-out `/` shows a small start page with Вход; a signed-out deep link goes straight to sign-in and comes back to the same page. Изход lands on `/`. The avatar menu holds "Акаунт" (a link to `onovaza.com/akaunt`) and "Изход".
- **Client-only SPA.** The app stays a TanStack Start SPA with Clerk only in the browser and Convex doing every check. So there is no `clerkMiddleware` and no Clerk secret key, on Vercel or on Convex.
- **Convex auth.** `convex/auth.config.ts` uses `customJwt`: issuer from `CLERK_JWT_ISSUER_DOMAIN`, its JWKS, RS256, audience (`applicationID`) `convex`. Users are looked up by the Clerk subject (`clerkUserId`, index `by_clerk_user`), never by `tokenIdentifier`. `convex/lib/auth.ts` stays the one place that reads the identity ([ADR 0006](./0006-business-is-the-auth-scope.md)). The token's `azp` (the page origin that asked for it) is checked only when `CLERK_AUTHORIZED_PARTIES` is set, as comma separated origins: production only, set last at cutover; dev and previews never.
- **No project deletes the Clerk user.** Deleting the Акаунт happens only on the hub (`onovaza.com/akaunt`). Here, **Изтрий данните** in Настройки, Данни wipes this app's data and keeps you signed in: your user row and push subscriptions go at once, the businesses you are alone in are erased, from shared ones you leave. A `user.deleted` webhook at `/clerk/webhook` on the Convex site runs the same erase when the Акаунт is deleted on the hub.
- **Hosts and instances.** Production moves to `https://klientite.onovaza.com`; the old `onova-za-klientite.vercel.app` redirects there. Previews keep their own Convex preview deployments ([ADR 0004](./0004-vercel-with-convex-previews.md)). Dev, previews and E2E move together to the shared app's development instance.
- Google and email code stay the only sign-in methods, now set once on the shared app.

## Consequences

- The Convex deployment must trust the new issuer before the frontend sends its tokens. Because the Vercel build runs `npx convex deploy`, the cutover sets Convex prod env first, Vercel Production env second, then runs one production build. A Vercel Instant Rollback restores only the frontend, so rolling back means the old env plus a revert and a rebuild.
- The owner's test rows on production carry a dev instance subject that no new sign-in matches. They are wiped at cutover with the same internal erase as Изтрий данните, not re-keyed.
- Installed copies on the old host keep serving a cached shell. A farewell service worker on that exact host clears the caches and the offline snapshot and sends each window to the new host.
- `bgBG`, `@clerk/localizations`, the bundle trim and the Turnstile source in the CSP go with the sign-in page. The CSP still takes its Clerk host from the publishable key (D111), so `pk_live_` gives `clerk.onovaza.com` with no edit.
- Without `azp` binding, any онова за subdomain's token would be accepted here (the audience is `convex` for every project). `CLERK_AUTHORIZED_PARTIES` closes that on production. "Run as user" in the production Convex dashboard then needs `"azp"` in the identity JSON.
- Sign-in data still sits with Clerk in the US; client data stays in the EU Convex deployment ([ADR 0002](./0002-convex-in-the-eu.md)). The legal sections for this app live on the hub's `/poveritelnost` and `/usloviya`, with the processor terms on `onovaza.com/obrabotvane-na-danni`.
