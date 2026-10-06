# Agent workflow

How to run, test and verify this repo. The product rules are in `docs/product-design.md` and win over everything else here.

> **Status:** milestone 0 (planning). There is no app code yet, so the commands below arrive with milestone 1. Until then, this file describes the target. Update it in the same PR that changes a command.

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
| `src/routes/` | TanStack file routes | `src/routeTree.gen.ts` is generated: commit it, never edit it |
| `src/components/ui/` | shadcn components | Add with `npx shadcn@latest add`, never by hand |
| `messages/` | `bg.json`, every UI string (Paraglide) | No Cyrillic in components (ADR 0009) |
| `e2e/` | Playwright journeys and the genericity check | Only what needs a browser |

## Run

```bash
pnpm install
npx convex dev            # terminal 1: dev deployment (EU), pushes on save
pnpm dev                  # terminal 2: http://localhost:3000
npx convex run seed:dev   # two test businesses: Мебели Стоянов, Хладина Сервиз
```

Env: `vercel env pull`, `clerk env pull` and `npx convex env`. Never print a secret or commit an `.env*` file.

## Test and verify

```bash
pnpm test                 # Vitest: shared/ (with fast-check) and convex/ (convex-test, edge-runtime)
pnpm typecheck            # app and convex/
pnpm lint && pnpm knip
pnpm ci:preflight         # everything CI runs: format, lint, typecheck, knip, tests, icons, build
pnpm test:e2e             # Playwright; needs a dev deployment and a Clerk test user
```

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
