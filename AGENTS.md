# Agent workflow

How to run, test and verify this repo. The product rules are in `docs/product-design.md` and win over everything else here.

> **Status:** milestones 1–10 are merged. A merge to `main` deploys production (https://onova-za-klientite.vercel.app, still on the Clerk development instance until launch, D50); every PR gets a Vercel preview with its own Convex preview deployment. Update this file in the same PR that changes a command.

## Before you change code

1. **`GLOSSARY.md`** is the domain glossary. Use its words in code, copy and PRs, and keep it in step with the code.
2. **`docs/product-design.md`** is the product design. If it and the code disagree, the doc wins: stop and say so.
3. **`docs/implementation-plan.md`** has the schema, the milestones, the open questions and the decisions made during the build.
4. **`docs/adr/`** has one ADR per stack or architecture choice. Read the ones for the area you touch.

## Layout

| Folder | Holds | Rule |
| --- | --- | --- |
| `shared/` | Pure TS: money, allocation, stages, fields, words, search, phones, dates, setup, the one-line parser | No Convex or browser imports. Tests first |
| `convex/` | Schema and functions. `convex/lib/` holds the auth wrappers, `getOwned`, the activity log and the ledger (every money write, ADR 0008) | Every public function uses a business wrapper (ADR 0006) |
| `src/routes/` | TanStack file routes. `_app.tsx` is the signed-in shell | `src/routeTree.gen.ts` is generated: commit it, never edit it |
| `src/components/ui/` | shadcn components | Add with `npx shadcn@latest add`, never by hand |
| `messages/` | `bg.json`, every UI string (Paraglide) | No Cyrillic anywhere in `src/`, comments included (ADR 0009). `src/paraglide/` is generated and ignored |
| `build/` | The Vite plugin that writes `/sw.js` (ADR 0010) | |
| `scripts/` | Icons, the CI preflight | |
| `e2e/` | Playwright journeys and the genericity check | Only what needs a browser |

## Run

```bash
pnpm install              # also compiles messages/ into src/paraglide/
npx convex dev            # terminal 1: dev deployment (EU), pushes on save
pnpm dev                  # terminal 2: http://localhost:3000
npx convex run seed:dev   # two test businesses: Мебели Стоянов, Хладина Сервиз
npx convex run system:whereAmI   # the deployment's region
npx convex run counts:backfill '{}'      # rebuild the job counts and Worker assignment rows from the jobs (D105, D106); production deploys run it themselves
npx convex run counts:fillAssignmentSearch '{}'   # one-time fill of the Worker assignment rows' job search text (D109); already run on dev, run once on production after the merge, not part of the deploy
npx convex run search:rebuildAll '{}'   # re-key every record's search text after a change to the search keys (D60)
```

Deploys: `vercel.json` runs `scripts/vercel-build.sh` (`npx convex deploy --cmd 'pnpm build' --preview-run 'seed:preview'`, then on production only `npx convex run counts:backfill '{"onlyMissing": true}' --prod`, which builds only businesses that have no counts yet and never restarts a recount under way; a failure there is logged as a warning and doesn't fail the build). The backfill is idempotent and rebuilds the job counts and Worker assignment rows (D105, D106); a recount whose pages stopped is dropped after an hour by the next job change; until it has run, a business with no counts row is recounted from its jobs, so lists never show zeros. A dev deployment needs it run by hand once. Check the Vercel build log for `convex: scheduling counts:backfill` and `convex: counts:backfill scheduled`, and `npx convex logs --prod` for the scheduled `counts:backfill` runs.

Env:
- `.env.local` gets `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` from `npx convex deployment select`, and the Clerk keys from `clerk env pull`.
- Convex env (`npx convex env list`): `CLERK_JWT_ISSUER_DOMAIN`, and `ALLOW_SEED=true` on dev and preview only. Both are also project defaults for new dev and preview deployments (`npx convex env default list --type preview`). Production never gets `ALLOW_SEED`. `CLERK_AUTHORIZED_PARTIES` (comma separated origins a token's `azp` must match) is set on production only, last at the cutover; while it is set, "run as user" in the Convex dashboard needs `"azp"` in the identity JSON (ADR 0012).
- Web Push (ADR 0011): `.env.local` also gets `VITE_VAPID_PUBLIC_KEY`, the public VAPID key (not a secret), which must match the Convex env `VAPID_PUBLIC_KEY`. Convex env also holds `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` address) and `APP_URL` (the app's https origin, for push links). Without them nothing is sent. Push works only in production builds (`pnpm build && pnpm preview`), where the service worker is registered.
- Never print a secret or commit an `.env*` file.

Sign-in:
- Clerk app "Onova za Klientite", development instance. Google and email code only; passwords and passkeys are off.
- Clerk's session token carries `aud: "convex"` (set with `clerk config patch`), so no JWT template is needed. Convex reads it as a `customJwt` provider (`convex/auth.config.ts`), which passes `azp` and `picture` through, and finds users by the Clerk subject (ADR 0012).
- Test users: `owner+clerk_test@example.com` and `new+clerk_test@example.com`, code `424242`. New `+clerk_test` users are created with `clerk users create`, because sign-up has a captcha that a headless browser can't pass.
- On dev and preview deployments, every user who signs in also joins the two seed businesses, so the switcher appears.

## Test and verify

```bash
pnpm test                 # Vitest: shared/ (with fast-check), src/ and convex/ (convex-test, edge-runtime)
pnpm typecheck            # compiles messages, then app and convex/
pnpm lint && pnpm knip
pnpm format               # Prettier, then eslint --fix
pnpm ci:preflight         # everything CI runs: format, lint, typecheck, knip, tests, icons, build
pnpm build && pnpm preview  # production build on :3000, with the service worker
pnpm generate-icons       # PNG icons and favicon from public/icon.svg and icon-maskable.svg
```

A Convex test file starts with `// @vitest-environment edge-runtime` and uses `setupConvex()` from `convex/test.setup.ts`. Playwright (`pnpm test:e2e`, once `pnpm test:e2e:install` has fetched Chromium) drives `e2e/` in a 390×844 browser against the dev server on :3000 (started or reused) and the dev deployment in `.env.local`, which needs `ALLOW_SEED=true` and `CLERK_SECRET_KEY` in its Convex env. Each spec file creates its own `+clerk_test` user through the Clerk Backend API and deletes the account in the app (Settings → Data) at the end. In CI the `e2e` job runs only when the repo secret `E2E_VITE_CONVEX_URL` is set; it also needs `E2E_VITE_CLERK_PUBLISHABLE_KEY` and `E2E_CLERK_SECRET_KEY`, all three from that dev deployment and its Clerk dev instance.

UI changes are verified in a real browser before a task counts as done:
- Use `agent-browser` at 390×844, signed in as a Clerk test user (`+clerk_test` email) or with `clerk impersonate`. A screen with a wide layout (sidebar, board, two columns: D54) is also checked at 1440×900 and 1024×768.
- Check every changed screen in **both** seeded businesses, and take screenshots of the key ones for the PR.
- Report what was verified and how, what wasn't, and what failed, with the output.

## Rules that are easy to get wrong

- Business is the top scope. Never trust a business id or a user id from the client.
- Money is integer euro cents. Calculated values (price, balance, credit, profit) are never typed. They are recomputed in the same mutation as their source (ADR 0008).
- Lists, money and reports read stage **groups**, never stage names.
- Customizing never destroys data: archive, don't delete.
- No gendered adjective and no number before a renamable noun: "+ Поръчка", "Ремонти: 5".
- Never add anything that issues receipts, invoices or fiscal documents.

## Workflow

1. Branch `feat/<milestone>` from an up-to-date `main`. Never commit to `main`.
2. Tests first for logic (`/tdd`), with UI text in the translation files.
3. Make small commits, and push the schema with `npx convex dev --once`.
4. Verify as above, then review the diff with `/code-review` and check auth on every Convex function.
5. Open the PR with `gh pr create`. Include what changed, which doc sections it covers, what was verified, what wasn't, and screenshots. Wait for CI and the Vercel preview.
6. Update `docs/implementation-plan.md`, then stop. A person merges.

**Ask the owner first** before any of these:
- merging;
- any production deploy (`vercel --prod`, `npx convex deploy`, `clerk deploy`);
- linking Vercel for the first time;
- creating the Convex project;
- adding a paid service, a new provider or a large dependency;
- changing anything the design doc decided.

No AI attribution in commits or PRs.

## Issues

GitHub Issues through `gh`, one per milestone (label `milestone`). PRs close their milestone issue.
