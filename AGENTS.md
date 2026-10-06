# Agent workflow

How to run, test and verify this repo. The product rules are in `docs/product-design.md` and win over everything else here.

> **Status:** milestone 1 (foundation) is built: the signed-in shell, Convex, Clerk and CI. Update this file in the same PR that changes a command.

## Before you change code

1. **`CONTEXT.md`** is the domain glossary. Use its words in code, copy and PRs, and keep it in step with the code.
2. **`docs/product-design.md`** is the product design. If it and the code disagree, the doc wins: stop and say so.
3. **`docs/implementation-plan.md`** has the schema, the milestones, the open questions and the decisions made during the build.
4. **`docs/adr/`** has one ADR per stack or architecture choice. Read the ones for the area you touch.

## Layout

| Folder | Holds | Rule |
| --- | --- | --- |
| `shared/` | Pure TS: money, allocation, stages, fields, words, search, phones, dates, setup, the one-line parser | No Convex or browser imports. Tests first |
| `convex/` | Schema and functions. `convex/lib/` holds the auth wrappers, `getOwned`, the activity log and recompute | Every public function uses a business wrapper (ADR 0006) |
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
```

Env:
- `.env.local` gets `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` from `npx convex deployment select`, and the Clerk keys from `clerk env pull`. Vercel comes after milestone 1 is merged.
- Convex env (`npx convex env list`): `CLERK_JWT_ISSUER_DOMAIN`, and `ALLOW_SEED=true` on dev and preview only. Both are also project defaults for new dev and preview deployments (`npx convex env default list --type preview`). Production never gets `ALLOW_SEED`.
- Never print a secret or commit an `.env*` file.

Sign-in:
- Clerk app "Onova za Klientite", development instance. Google and email code only; passwords and passkeys are off.
- Clerk's session token carries `aud: "convex"` (set with `clerk config patch`), which is what Clerk's Convex integration does, so no JWT template is needed.
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

A Convex test file starts with `// @vitest-environment edge-runtime` and uses `setupConvex()` from `convex/test.setup.ts`. Playwright (`pnpm test:e2e`) arrives in milestone 10.

UI changes are verified in a real browser before a task counts as done:
- Use `agent-browser` at 390×844, signed in as a Clerk test user (`+clerk_test` email) or with `clerk impersonate`.
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
