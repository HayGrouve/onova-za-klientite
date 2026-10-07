# Implementation plan: v1 (Level 1, Level-2-ready data)

How Онова за клиентите goes from an empty repo to a version the first user (a solo furniture maker) uses every day. The product rules come from [`docs/product-design.md`](./product-design.md), and the doc wins over this plan. Domain words are defined in [`CONTEXT.md`](../CONTEXT.md). Stack choices are recorded in [`docs/adr/`](./adr/).

**Status:** milestone 0 (this plan) merged in #13 on 6 Oct 2026. Milestones 1 to 10 are built and in review as stacked PRs. Nothing is deployed to production. Vercel is linked after milestone 1 merges.

## Contents

1. [Architecture](#architecture)
2. [Convex schema draft](#convex-schema-draft)
3. [Calculated values](#calculated-values)
4. [Milestones](#milestones)
5. [Questions for the owner](#questions-for-the-owner)
6. [Decisions made during the build](#decisions-made-during-the-build)
7. [Spikes](#spikes)
8. [Done, next, open](#done-next-open)

## Architecture

```
shared/        Pure TypeScript, no Convex or browser APIs. Tested first.
  money.ts       cents, parsing "1 200,50", formatting, line totals
  allocation.ts  splitting a payment across jobs, credit, write-off
  stages.ts      stage groups, delete and move rules
  fields.ts      the eight field types, safe-change rules, value validation
  words.ts       renamable nouns, guessPlural, copy helpers for counts
  search.ts      transliteration fold, plate look-alikes, spaceless keys
  phone.ts       normalising to E.164 (+359…), display format
  dates.ts       calendar dates in Europe/Sofia, "днес/утре/в петък"
  setup.ts       wizard answers → settings (ported from the prototype)
  parse-line.ts  the one-line new-job parser (ported from the prototype)
convex/        Backend. Every public function is wrapped (ADR 0006).
  lib/           auth wrappers, getOwned, activity log, recompute, batches
  schema.ts      the tables below
src/
  routes/        TanStack file routes
  components/    app components; ui/ is shadcn only
  i18n/          helpers around the compiled messages (words, counts)
  lib/           browser-only helpers (offline snapshot, push, share, install)
messages/      bg.json: every UI string (Paraglide, ADR 0009)
e2e/           Playwright journeys, including the genericity check
```

Where a rule lives:

| Rule | Lives in | Tested by |
| --- | --- | --- |
| Arithmetic, parsing, folding, grammar | `shared/` | Vitest + fast-check, test-first |
| Who may do what, consistency across tables | `convex/` | `convex-test` through the real functions |
| What the screen shows | `src/` | `agent-browser` at 390×844, Playwright for main flows |

## Convex schema draft

A draft for review. Final validators land in milestone 2. All amounts are integer euro cents (ADR 0007). Calendar dates (due dates, payment and cost dates, reminder dates) are `"YYYY-MM-DD"` strings in Europe/Sofia time. Moments (appointment start and end, created times) are milliseconds since epoch. Every table except the per-person ones (`users`, `pushSubscriptions`, `deletionJobs`) has `businessId` and is only reached through the business wrappers (ADR 0006).

```ts
// ── People and access ──────────────────────────────────────────────────
users: {
  tokenIdentifier: string            // issuer|subject, from ctx.auth
  clerkUserId: string                // subject, for Clerk Backend API calls (account deletion)
  name: string, email?: string, imageUrl?: string
  activeBusinessId?: Id<"businesses">
}  .index("by_token", ["tokenIdentifier"])

businesses: {
  name: string, logoFileId?: Id<"files">
  phone?: string, email?: string, address?: string
  words: {                           // renamable nouns (Customization → Names)
    client: Word, job: Word, item: Word, appointment: Word
  }                                  // Word = { singular, plural, gender: "m"|"f"|"n" }
  modules: { appointments, costs, items, reminders, services: boolean }
  jobFlow: "single" | "multi"        // new job asks "when" (single) or "by when" (multi)
  depositsOnNewJob: boolean          // wizard step 5a
  repeatDefault?: { every: number, unit: "week" | "month" }   // wizard step 6
  reminderRule?: { months: number }  // set = on
  setup: { answers: SetupAnswers, completedAt?: number }      // for "run setup again"
  noClientId?: Id<"clients">         // the built-in "No client"
  storageBytes: number               // running total of file sizes, for later limits
}

memberships: {                       // Level-2-ready: roles from day one
  businessId, userId: Id<"users">
  role: "owner" | "manager" | "worker"
  deactivatedAt?: number             // deactivated, never deleted
  notify: { morningSummary: boolean, remindersDue: boolean, overdue: boolean }
  nextSummaryAt?: number             // next 07:30 Sofia time, in UTC ms; crons are UTC only
}  .index("by_user", ["userId"]) .index("by_business_user", ["businessId", "userId"])
   .index("by_next_summary", ["nextSummaryAt"])

// ── Clients and items ─────────────────────────────────────────────────
clients: {
  businessId, kind: "person" | "company", name: string
  isNoClient: boolean                // exactly one per business; never renamed, merged or anonymized
  phones: { e164: string, label?: string }[]
  email?: string, address?: string, note?: string
  preferredChannel?: "phone" | "viber" | "sms" | "email"     // customer-ready
  consent: { service?: Consent, marketing?: Consent }         // Consent = { given: boolean, at: number }
  extra: Record<fieldId, FieldValue>
  creditCents: number                // cached, ADR 0008
  searchText: string                 // folded keys, see "Search"
  anonymizedAt?: number, mergedIntoId?: Id<"clients">
}  .index("by_business_name", ["businessId", "name"])
   .searchIndex("search", { searchField: "searchText", filterFields: ["businessId"] })

clientPhones: {                      // lookup for duplicate warnings (arrays can't be indexed)
  businessId, clientId, e164: string
}  .index("by_business_e164", ["businessId", "e164"]) .index("by_client", ["clientId"])

items: {
  businessId, clientId, name: string // e.g. "Daikin FTXM35, хол"
  extra: Record<fieldId, FieldValue>
  searchText: string
}  .index("by_client", ["clientId"]) .index("by_business", ["businessId"])
   .searchIndex("search", { searchField: "searchText", filterFields: ["businessId"] })

// ── Work ──────────────────────────────────────────────────────────────
stages: {
  businessId, name: string, order: number, color: StageColor
  group: "new" | "in_progress" | "done" | "cancelled"
  clientName?: string, visibleToClient: boolean              // customer-ready
}  .index("by_business_order", ["businessId", "order"])

jobs: {
  businessId, clientId, title: string
  stageId, stageGroup: StageGroup    // group copied from the stage for indexing
  stageChangedAt: number, doneAt?: number
  lines: { id: string, description: string, quantity: number,
           unitPriceCents: number, serviceId?: Id<"services"> }[]
  typedPriceCents?: number           // used only when lines is empty
  dueDate?: string                   // "YYYY-MM-DD"
  address?: string                   // copied from the client when the job is created
  notes?: string
  itemIds: Id<"items">[]             // mirrored in jobItems for indexing
  assigneeIds: Id<"memberships">[]   // Level-2-ready; empty in Level 1
  source: "manual" | "phone" | "online"                      // customer-ready
  repeat?: { every: number, unit: "week" | "month", nextJobId?: Id<"jobs">, stoppedAt?: number }
  nextRepeatOn?: string              // set while the next job of the series is still to be created
  seriesId?: Id<"jobs">              // first job of a repeat series
  writeOff?: { amountCents: number, note: string, at: number, by: Id<"memberships"> }
  cancelReason?: string
  extra: Record<fieldId, FieldValue>
  // cached, ADR 0008
  priceCents, paidCents, costCents, balanceCents: number
  owes: boolean                      // balanceCents > 0 and group is not cancelled
  searchText: string                 // title + client name + extra fields
  createdBy: Id<"memberships">
}  .index("by_business_group_due", ["businessId", "stageGroup", "dueDate"])
   .index("by_business_stage", ["businessId", "stageId"])     // "stage still has jobs"
   .index("by_business_owes", ["businessId", "owes", "stageGroup"])
   .index("by_client", ["clientId"])
   .index("by_next_repeat", ["nextRepeatOn"])                 // cross-business cron
   .searchIndex("search", { searchField: "searchText", filterFields: ["businessId", "stageGroup"] })

jobItems: { businessId, jobId, itemId }                      // item history survives a move
   .index("by_item", ["itemId"]) .index("by_job", ["jobId"])

appointments: {
  businessId, jobId?: Id<"jobs">     // no job = blocked time (Level 2)
  clientId?: Id<"clients">           // copied from the job, for the client page
  start: number, end?: number, allDay: boolean, label?: string
  assigneeIds: Id<"memberships">[]   // Level-2-ready
  resourceIds?: Id<"resources">[]    // Level 2 adds the table; no migration
  doneAt?: number, cancelledAt?: number
}  .index("by_business_start", ["businessId", "start"]) .index("by_job", ["jobId"])

services: {
  businessId, name: string, priceCents: number, order: number
  archivedAt?: number, durationMinutes?: number              // duration is Level 2
}  .index("by_business_order", ["businessId", "order"])

reminders: {
  businessId, date: string, note: string
  clientId?, jobId?, itemId?
  source: "manual" | "rule"
  status: "open" | "done" | "dismissed", closedAt?: number
}  .index("by_business_status_date", ["businessId", "status", "date"])
   .index("by_client", ["clientId"]) .index("by_job", ["jobId"]) .index("by_item", ["itemId"])

// ── Money ─────────────────────────────────────────────────────────────
payments: {
  businessId, clientId, amountCents: number                  // negative = refund
  date: string, method: "cash" | "bank" | "card" | "other"
  label?: string                     // "Капаро" for deposits
  note?: string
  allocatedCents: number             // cached sum of its allocations
  createdBy: Id<"memberships">       // a Level 2 worker can record payments
}  .index("by_business_date", ["businessId", "date"]) .index("by_client", ["clientId"])

allocations: {                       // the part of one payment applied to one job
  businessId, paymentId, jobId, clientId, amountCents: number
}  .index("by_payment", ["paymentId"]) .index("by_job", ["jobId"])

costs: {
  businessId, jobId?: Id<"jobs">     // no job = general cost (rent, fuel, tools)
  amountCents: number, date: string, label: string, note?: string
}  .index("by_business_date", ["businessId", "date"]) .index("by_job", ["jobId"])

// ── Customization ─────────────────────────────────────────────────────
fields: {
  businessId, target: "client" | "job" | "item", name: string
  type: "text" | "longText" | "number" | "money" | "date" | "yesNo" | "choice" | "photo"
  options?: { id: string, name: string, archivedAt?: number }[]   // choice only
  showInList: boolean, order: number
  archivedAt?: number                // archived, never deleted, once it holds data
  visibleToClient: boolean           // customer-ready
}  .index("by_business_target_order", ["businessId", "target", "order"])

// ── Files, history, messages ──────────────────────────────────────────
files: {
  businessId, storageId: Id<"_storage">, kind: "photo" | "file"
  mimeType: string, size: number, name?: string
  jobId?, clientId?, itemId?, fieldId?
  visibleToClient: boolean           // customer-ready
  uploadedBy: Id<"memberships">
}  .index("by_job", ["jobId"]) .index("by_client", ["clientId"]) .index("by_item", ["itemId"])
   .index("by_business", ["businessId"])

activity: {                          // every change; feeds the timelines
  businessId, actorId: Id<"memberships">
  type: "job.created" | "job.stageChanged" | "payment.added" | …   // closed list
  jobId?, clientId?, itemId?, paymentId?, costId?
  data: { … }                        // small, typed per event type (from/to, amounts)
}  .index("by_job", ["jobId"]) .index("by_client", ["clientId"]) .index("by_item", ["itemId"])
   .index("by_business", ["businessId"])

messages: {                          // customer-ready messages log
  businessId, clientId, jobId?
  channel: "phone" | "viber" | "sms" | "email", recipient: string
  kind: "manual" | "automatic", template?: string
  status: "logged" | "queued" | "sent" | "delivered" | "failed"
  note?: string, by?: Id<"memberships">
}  .index("by_client", ["clientId"]) .index("by_job", ["jobId"])

shareLinks: {                        // customer-ready, no UI in v1
  businessId, tokenHash: string      // the token itself is never stored
  target: { kind: "job" | "client", id: string }
  permission: "view" | "approve" | "book"
  expiresAt?: number, cancelledAt?: number, createdBy
}  .index("by_token_hash", ["tokenHash"])

pushSubscriptions: {                 // one per device; removed on a 404 or 410 from the push service
  userId, endpoint: string, keys: { p256dh: string, auth: string }
  userAgent?: string, lastSuccessAt?: number
}  .index("by_user", ["userId"]) .index("by_endpoint", ["endpoint"])

deletionJobs: {                      // account deletion runs in batches; this tracks progress
  userId, businessIds: Id<"businesses">[], table: string, status: "running" | "done"
}
```

**Level-2-ready without a migration.** Memberships with roles, `assigneeIds` on jobs and appointments, appointments without a job, and the six customer-ready structures exist from the first schema. Level 2 later adds new tables (`resources`, `timeEntries`, invitations) and optional fields. Neither of those changes existing documents.

**Counting for later limits.** Active jobs: index `by_business_group_due` over the *New* and *In progress* groups. Clients: `by_business_name`. Storage: `businesses.storageBytes`, kept up to date by the file mutations.

**Search.** Every searchable record stores a `searchText` built by one pure function in `shared/search.ts`. For each value it adds:
- the transliteration fold (Иван → ivan);
- the plate look-alike fold, which maps the 12 letters shared by Bulgarian plates (А В Е К М Н О Р С Т У Х ↔ A B E K M H O P C T Y X) to one alphabet;
- a spaceless copy of short values, so `CA1234BP` finds `СА 1234 ВР`.

Queries are folded the same way. Extra field values are included. Renaming a choice option or a client reschedules a batched rebuild of the affected `searchText` values.

Why it's folded to Latin before it's stored:
- Convex's search tokenizer does no transliteration or folding.
- It prefix-matches only the last query word.
- It silently drops terms longer than 32 bytes, which is any Cyrillic word of about 16 letters or more.

Storing Latin keys avoids all three. Phone lookups (duplicates) use the ordinary `clientPhones` index instead. `convex-test` fakes search loosely, so the folding is tested as pure functions in `shared/search.ts`, and search itself is checked against a real dev deployment. Each search query is billed by the size of the whole search index, which is fine at Level 1 sizes. Revisit if it shows up in usage.

## Calculated values

None of these can be typed by a user. The cached ones are recomputed in the same mutation that changes a source (ADR 0008).

| Value | Formula | Stored? |
| --- | --- | --- |
| Line total | `round(quantity × unitPriceCents)` | No |
| Job price | Sum of line totals, or `typedPriceCents` when there are no lines | `jobs.priceCents` |
| Job paid | Sum of the job's allocations (refund allocations are negative) | `jobs.paidCents` |
| Job balance | price − paid − write-off | `jobs.balanceCents` |
| Owes | balance > 0 and the group is not *Cancelled* | `jobs.owes` |
| Job costs | Sum of the job's costs | `jobs.costCents` |
| Job profit | paid − job costs (hidden while Costs is off) | No |
| Payment allocated | Sum of its allocations | `payments.allocatedCents` |
| Client credit | Sum of the client's payments − sum of their allocations | `clients.creditCents` |
| Received this month | Sum of payments dated in the month, refunds included | No |
| Costs this month | Sum of all costs dated in the month, job and general | No |
| Profit this month | received − costs (hidden while Costs is off) | No |
| Still owed | Sum of `balanceCents` where `owes` | No |
| Overdue | `dueDate` < today and the group is *New* or *In progress* | No, date-dependent |
| Due soon | `dueDate` within the next 3 days, same groups | No |
| Reminder due | `status = open` and `date` ≤ today | No |
| Done but unpaid | group *Done* and `owes` | No |

**Invariants**, all property-tested in milestone 2:
- the allocations of a payment have the payment's sign and never add up to more than it;
- an allocation only goes to a job of the same client;
- every cache equals a recomputation from scratch;
- price = paid + balance + write-off for every job.

## Milestones

One PR each, in this order. Each has a GitHub issue. Every milestone follows the loop in [Working loop](#working-loop).

### 0. Plan (#12)

- [x] `CONTEXT.md`, ADRs, this plan, `AGENTS.md` and `CLAUDE.md`
- [x] One GitHub issue per milestone
- [x] Questions for the owner (below)

**Acceptance:** the owner has reviewed and answered the questions. Merged in #13. Q19 and Q21 are answered, and the rest follow their proposals unless the owner says otherwise.

### 1. Foundation (#2)

| Task | Acceptance check |
| --- | --- |
| TanStack Start at the repo root: strict TS, the `#/` alias, Nitro `vercel` preset, security headers | `pnpm dev` serves a page. `pnpm build` passes |
| shadcn `base-nova` with the prototype's `components.json`, theme tokens and Sofia Sans | A sample screen matches the prototype's look at 390×844 |
| SPA mode, plus the service worker plugin (shell and assets only for now, ADR 0010) | `pnpm build && pnpm preview`: the app opens with the network off in DevTools |
| Spike: `@clerk/tanstack-react-start` in SPA mode, with `@clerk/react` as the fallback | Sign-in, sign-out and reload all work. The choice goes in the PR |
| ESLint (TanStack config), Prettier, knip, Vitest (inside `vite.config.ts`) | `pnpm ci:preflight` passes locally |
| CI on `ubuntu-latest`: format check, lint, typecheck (app + `convex/`), knip, tests, build | Green on the PR |
| Convex project on the team's Free plan, with a disposable dev deployment, in EU (Ireland) if Free allows it (ADR 0002, Q19) | `npx convex run system:whereAmI` prints the region, and the PR records it |
| Clerk: Google + email code only, `bgBG`, Clerk's Convex integration (ADR 0003) | Sign-in works in Bulgarian on a phone viewport |
| Paraglide with `messages/bg.json` (ADR 0009), and a test that fails on Cyrillic text in components | The test fails on a planted hard-coded string |
| PWA manifest (`lang: "bg"`), icons from the sibling's sharp script with a padded maskable icon, SW registration | Chrome DevTools shows it installable. `check-icons` passes |
| `users.ensureCurrent`, then a business with defaults on first sign-in: stages, "No client", words, the owner membership | A new test user lands in their own business |
| Signed-in shell: bottom nav (Днес, {Jobs}, Клиенти, Пари) and the "+" button, a business switcher when there are two or more | Screens are empty placeholders. The nav uses the business's words |
| Dev seed `npx convex run seed:dev`: Мебели Стоянов and Хладина Сервиз with settings, stages, services, clients, and items for the AC business. Jobs and money are added in milestone 2 | Running it twice gives the same result. It refuses to run on production |
| `AGENTS.md` updated with the real commands | The commands in it work |

**Vercel** is linked only after this PR is merged, as you asked. The order is:
1. merge;
2. link, with the build command and both deploy keys from ADR 0004;
3. the first production deploy from `main`, with your OK;
4. only then preview deploys for feature branches.

Convex preview deployments work on every plan, so each PR from milestone 2 on gets its own seeded backend.

### 2. Domain core (#3)

| Task | Acceptance check |
| --- | --- |
| Full schema from the draft above | `npx convex dev --once` pushes it |
| `shared/money.ts`, `allocation.ts`, `stages.ts`, `fields.ts`, `words.ts`, `phone.ts`, `dates.ts`, written test-first | Worked examples plus fast-check properties for the invariants |
| Business wrappers, `getOwned`, role checks | A test calls every public function as a stranger and expects each one to fail |
| Activity log helper, used by every mutation | A test asserts the event for each mutation |
| `recomputeJob` and `recomputeClient`, plus the cache-check helper | The cache check runs after every mutation test |
| Mutations: jobs (create, edit, stage change, lines, items, write-off, cancel), payments (from a job, from a client with a split, refund), costs (job and general), stages (add, rename, reorder, regroup, delete with move), fields (add, archive, restore, type change, options), "No client" | One test per rule from "Rules that are easy to get wrong" in the prompt, named after the rule |
| Seed: jobs, payments, costs and reminders for both businesses | Both businesses show realistic balances and credit |

No screens, except a dev-only page if a rule is easier to check by eye.

### 3. Setup wizard (prototype 1, variant C) (#4)

| Task | Acceptance check |
| --- | --- |
| Port `settingsFromAnswers`, `stagesFor`, `guessPlural`, `jobFormFields` and the defaults to `shared/setup.ts`, with tests | The prototype's cases pass, and skipping everything gives a working setup |
| Port the wizard copy to the translation files | No Cyrillic in components |
| `/setup`: Job form preview on top, the question below, every step skippable, change links at the end | Matches prototype C at 390×844, in both seeded setups |
| Apply the answers in one mutation through the safe-change rules (see Q12) | Running setup again never deletes a stage that holds jobs or a field that holds data |
| Settings → "Run setup again" opens it with current answers | Answers are filled in |
| Step 8 (import) links to milestone 9 | It goes to a placeholder for now |
| Flow timer (see Q15) | It records a time from opening setup to the review screen |

### 4. "+" New job (prototype 2, variant B) (#5)

| Task | Acceptance check |
| --- | --- |
| Port `parseLine` to `shared/parse-line.ts`, with money in cents and the extended search fold | All prototype examples pass, plus new tests for each segment kind |
| One-line screen with the read-back: client, title, price, deposit and date, each fixable | Matches prototype B at 390×844, in both seeded businesses |
| Client: existing (search), phone contact (Contact Picker where supported), or new | On a browser without the Contact Picker the option is hidden |
| Save in one mutation: client if new, job, deposit payment allocated to the job, appointment or due date | One activity event per record. The cache check passes |
| At most two required fields: client (or "No client") and title | Saving with only those two works |
| Flow timer | It records a time from tapping "+" to saved |

### 5. Today, Jobs and Clients (#6)

Prototype 3 was never built, so these screens come straight from the doc. Each PR lists the choices it makes.

| Task | Acceptance check |
| --- | --- |
| Today: today's appointments, upcoming, overdue, due soon, reminders due, done but unpaid | Each section is empty-safe and checked against both seeds |
| Jobs: tabs by stage group, newest first | Counts read "{Jobs}: 5", never "5 {jobs}" |
| Client page: call and Viber buttons, items, jobs, payments, credit, timeline | The Viber link opens a chat with the E.164 number |
| Job page: stage, appointments, lines, notes, linked items, timeline, photos and files | The camera opens in one tap from the job page |
| File upload to Convex storage, with size and type limits | `storageBytes` changes on upload and delete |
| Item page: fields, owner, history, move to another client | History stays after a move |

### 6. Money (#7)

| Task | Acceptance check |
| --- | --- |
| Payment from a job (auto-allocated, rest becomes credit), from a client (split), refund, write-off | Matches the invariants. The balance reads correctly on the job and client pages |
| Use client credit on a job (see Q8) | Credit goes down and the job balance goes down |
| Costs: on a job and general | Profit changes. It is hidden while Costs is off |
| Money screen: received, still owed with "who owes me", credit held, costs, profit, by month | Figures match a hand calculation on the seed |

### 7. Settings and customization (#8)

| Task | Acceptance check |
| --- | --- |
| Sections: Business, Names (with gender), Modules, Stages, Fields (tabs for clients, jobs, items; "show in list"), Services and prices, Reminders, Data, Run setup again | Each section works on its own and saves |
| "+ field" link on the client, job and item forms | A field added there shows up in Settings |
| Safe changes in the UI: archive and restore, a blocked stage delete with "move jobs to…", text ↔ long text only | Each blocked action explains why, in Bulgarian |
| Grammar check | Renaming the Job word to "Ремонт" leaves no gendered adjective or count before it anywhere |

### 8. Search, reminders, repeat and push (#9)

| Task | Acceptance check |
| --- | --- |
| One search box over clients, jobs and items | Ivan ↔ Иван, `CA1234BP` ↔ `СА 1234 ВР`, and a value from an extra field all match |
| Reminders: add, done, dismiss. Reminder rule on reaching *Done* (see Q5) | A rule reminder appears N months after the done date |
| Repeat: next job created on schedule (see Q6), stop repeating | A daily, idempotent cron over `by_next_repeat`. Tested by calling the cron's handler with fake time (`convex-test` doesn't run crons) |
| Web Push: subscribe after a user gesture, a morning summary at 07:30 Sofia time, reminders due, overdue (ADR 0011). A 15-minute cron sends to memberships whose `nextSummaryAt` has passed, through the `workpool` component | A real notification arrives on an Android phone. Sofia daylight-saving changes are covered by tests |
| iPhone: guide to "Add to Home Screen" before offering push | Shown only on iOS Safari outside the installed app |

### 9. Job summary, import, export and GDPR (#10)

| Task | Acceptance check |
| --- | --- |
| Job summary image: lines, price, deposit, balance, logo, and "Това не е фактура". Rendered with `satori` (lazy-loaded, a static Sofia Sans TTF for Cyrillic), then drawn to a canvas as PNG. The file is made when the preview opens, so the tap can share it straight away | Shared to Viber from an Android phone and an iPhone through the Web Share API. Fallbacks, in order: download, copy the image, then text through `viber://forward` |
| Import from phone contacts (Android Chrome only, feature-detected) and from Excel or CSV, mapping unknown columns to a field or a new extra field. `.xlsx` is read with `read-excel-file`, and CSV with `papaparse`. CSV in windows-1251 with `;` is decoded correctly. An old `.xls` file gets a plain message asking to save it as `.xlsx` or CSV (D20) | The 57-row sample file imports as `.xlsx` and as a Bulgarian Excel CSV. An `.xls` shows the message. Duplicates are flagged |
| Duplicate warning on a matching phone, and merging two clients | Jobs, payments, items, reminders and messages move. Credit is recomputed |
| Export all data (JSON plus CSV per table, in a zip) | Re-reading the export finds every record |
| Anonymize a client. Delete the account and its data (batched) | The jobs and money of an anonymized client remain. Nothing remains after deletion |

### 10. Offline and release hardening (#11)

| Task | Acceptance check |
| --- | --- |
| View-only offline snapshot (ADR 0010): one `offline.snapshot` query, kept in IndexedDB per user and wiped on sign-out | In airplane mode on Android and iPhone, a cold start opens today's jobs, client contacts and open jobs. Edits show a plain message. Reconnecting after a token refresh recovers |
| Accessibility pass and a Lighthouse mobile run on the preview | No serious issues. Scores go in the PR |
| Playwright E2E: sign in, setup, new job, payment, Money screen, job summary | Green in CI |
| Genericity check: the six businesses from the doc, set up through the wizard and settings alone, as E2E tests | Green. If one needs profession-specific code, stop and report |
| Production deploy, with the owner's OK | The cycle's "done" list is met on an Android phone |

### Working loop

The same for every milestone:
1. Branch `feat/<milestone>` from an up-to-date `main`.
2. Write tests first for the logic. Put UI text in the translation files.
3. Make small commits, and push the schema with `npx convex dev --once`.
4. Verify:
   - typecheck, lint, tests and build all pass;
   - every changed screen at 390×844 in `agent-browser`, in both seeded businesses, signed in as a Clerk test user;
   - screenshots of the key screens.
5. Run `/code-review` on the diff, and check auth on every Convex function.
6. Open the PR with what changed, which doc sections it covers, what was verified, what wasn't, and the screenshots. Wait for CI and the preview, then check the preview.
7. Update this plan (done, next, open), then stop and ask the owner to merge.

## Questions for the owner

Where the design doc is silent or contradicts itself, or where the prompt and the doc differ. Each has a proposed answer. The build follows the proposal unless you say otherwise.

### Contradictions

**Q1. Two-stage lists vs "each group keeps a stage".** The genericity table gives the AC technician "Насрочено → Изпълнено", and the tutor, groomer and cleaner two stages each. The safe-change rule says New, In progress and Done each keep at least one stage, so a two-stage list can't exist.
*Proposal:* keep the rule. Those businesses get a third stage they simply skip ("В работа"). The prototype already did this. The genericity E2E checks the stage names in the table plus that hidden third stage.

**Q2. "Through the wizard alone" vs "wizard and settings".** The doc says the six businesses fit "through the wizard alone". The prompt says "wizard and settings alone". The wizard can't name stages (step 3 only picks one-off vs several steps), so the furniture maker's "Оглед → Изработка → Монтаж → Готово" needs Settings.
*Proposal:* follow the prompt (wizard and settings), and change the doc's sentence to match.

**Q3. Is "Job lines" a module?** The data model table says Job line "can be switched off". The Modules list (Appointments, Costs, Items, Reminders, Service list) doesn't include it.
*Proposal:* not a module. Lines are always available but hidden behind "more" until a job has one. That keeps the switch count down, and a job with no lines simply uses the typed price.

**Q4. Which wizard answers switch which modules?** The genericity table lists "Modules on" per business: Appointments is on for the furniture maker, tutor and cleaner, and off for the AC technician, car shop and groomer. No wizard question decides Appointments, and Service list isn't on for anyone even though step 7 asks for services.
*Proposal:*
- Appointments: on by default for everyone. A one-visit business's "when" is an appointment.
- Items: from step 4.
- Costs: from step 5. It defaults to on.
- Reminders: on when step 6 is "every few months".
- Service list: on when step 7 has at least one service.

The genericity E2E then checks words, item, stages, repeat and reminder rule, not an exact module list.

### Silent spots

**Q5. Reminder rule: create or suggest?** "Suggest a reminder in N months" could mean that the app creates one, or that it asks first.
*Proposal:* when a job reaches *Done*, show a pre-filled reminder for the client, job and items, with "Добави" and "Не сега". One tap, no surprise reminders.

**Q6. When does a repeating job create the next one?**
*Proposal:* when the current job's date arrives, the next job is created one interval later. That's the appointment for one-visit businesses, the due date otherwise. So there is always exactly one upcoming job per series. A daily job runs at 03:00 Sofia time. "Stop repeating" ends the series. The next job copies the title, client, items, lines or price, address and stage *New*.

**Q7. What counts as "still owed"?** A job in progress with a deposit has a balance, but nothing is due yet.
*Proposal:* "Кой ми дължи" and "Still owed" count every job with a balance that isn't *Cancelled*, grouped by client. Done ones come first and are marked. Today's "done but unpaid" shows only *Done*.

**Q8. Using client credit on a new job.**
*Proposal:* never automatic. A job page shows "Предплатено: 200 € · Приспадни" when the client has credit, and one tap allocates it. Paying from the client page splits across open jobs oldest first, and you can change the split before saving.

**Q9. Is "капаро 300" on a new job money received?**
*Proposal:* yes. It's a payment labelled "Капаро", paid today, in cash, allocated to the new job. Method and date can be changed in the read-back.

**Q10. What is the stored gender of a renamable word used for?** The prompt asks Settings → Names to ask for the gender, but the doc's main rule is to avoid gendered words.
*Proposal:* store it and keep the v1 copy gender-neutral. Gender is only used where avoiding it reads badly. Today that is nowhere, so the first use will be flagged in a PR. The wizard's "own word" asks for singular and plural, and Settings asks for the gender.

**Q11. Anonymize: what goes?**
*Proposal:*
- Removed: name (shown as "Анонимен клиент"), phones, email, address, note, the client's extra fields, consent, the client's messages log, and files attached to the client.
- Kept: jobs, money, items, and files attached to jobs.
- It can't be undone, and the activity log records it without the old values.

**Q12. "Run setup again" on a business with data.**
*Proposal:* applies the new answers through the same safe-change rules.
- Words are renamed.
- Modules are switched (hidden, never deleted).
- Stages from the new job flow are added, and existing stages are kept.
- Item fields are added, and existing ones are kept.
- Services are merged by name.

The review screen lists what will change before applying.

**Q13. A second business.** The doc says a person can belong to several, but not how they create one.
*Proposal:* Settings → Business → "Добави бизнес" runs setup for a new one. A switcher appears in the header only once there are two.

**Q14. Morning summary time and content.**
*Proposal:* 07:30 Sofia time, only when there's something to say: "Днес: 2 срещи, 1 закъснял срок, 3 напомняния". Per-member on/off switches for the summary, reminders and overdue. No time picker in v1.

**Q15. "Dev-only" timer vs timing on the first user's phone.** The phone will run the production build.
*Proposal:* a hidden flag. Opening any page with `?timing` turns it on for that device, saved in `localStorage`. While it's on, setup and new job show a small stopwatch and record times locally (never on the server). `/timing` lists them, and `?timing=off` hides it again.

**Q16. Job summary: image or PDF?**
*Proposal:* image (PNG) only in v1. Viber shows an image inline in the chat, while a PDF arrives as a file to open. PDF later if clients ask.

**Q17. "Overdue" and appointments.**
*Proposal:* only jobs are overdue: due date passed, still *New* or *In progress*. An appointment in the past is history, not overdue. "Due soon" is the next 3 days.

**Q18. Job numbers.** The doc has none.
*Proposal:* none in v1. Jobs are found by client and title. A visible number also makes the summary look more like an invoice.

### Accounts, deploys and providers

Q19–Q22 are answered.

**Q19. Convex region: please confirm before I create anything.** It's `aws-eu-west-1` (Ireland), for production, dev and previews, created with `--region eu` (ADR 0002). Usage there is billed at 1.3×. I'd also like you to set the team's default region to Europe (Ireland) in Convex Team settings. It's the one dashboard click with no CLI equivalent, and it stops any automatic path from creating a US deployment by mistake.

> **Answer (6 Oct 2026):** stay on the team's Free plan. Development data is disposable, so dev and preview deployments use what Free allows. That means EU (Ireland) if Free offers it, and otherwise the default region. The production deployment is created fresh in EU (Ireland) when the app is ready to launch, with the owner's OK. No team default region change is needed now.

**Q20. New dependencies.** These are planned, and you asked to approve unusual or large ones:

| Package | For | Notes |
| --- | --- | --- |
| `@inlang/paraglide-js` | Translation files (ADR 0009) | Compiles to typed functions, tiny at runtime |
| `libphonenumber-js` (`max` metadata) | +359 normalization | About 40 KB gz, lazy-loaded in forms. `min` accepts invalid numbers |
| `idb-keyval` | Offline snapshot | Under 1 KB |
| `web-push` | Sending push from Convex | Server only. Last release Jan 2024 |
| `satori` | Job summary image | About 183 KB gz, lazy-loaded, MPL-2.0 |
| ~~SheetJS CE 0.20.3 (`xlsx`)~~ `read-excel-file` + `papaparse` | Excel and CSV import | Both on npm and lazy-loaded. Neither reads legacy `.xls` (D20). SheetJS was rejected because its npm copy is stale with CVEs, and the fixed version is only on its own CDN |
| Convex components | See D12 | Official, pinned |

> **Answer (6 Oct 2026):** all approved, except SheetJS. Excel import uses `read-excel-file` (`.xlsx`) and `papaparse` (CSV) instead.

**Q21. Convex plan and backups.** Free has hard caps: 1M function calls, 0.5 GB database, 1 GB files, and no automatic backups. That's fine for building.
*Proposal:* stay on Free until the first user's real data goes in. Then move to Pro ($25/month) for daily backups, or Starter (pay as you go) plus a weekly manual `npx convex export`. The choice is yours; either way it's before milestone 10.

> **Answer (6 Oct 2026):** Free while developing. There is no data worth keeping, so there are no backups. Plan and backups are decided again before the production deployment is created.

> **Update (7 Oct 2026):** the team is on Starter (pay as you go), which is fine for the development cycle. Backups are decided again before real customer data goes in.

**Q22. Merging deploys production.** With ADR 0004, a merge to `main` runs `npx convex deploy` and the Vercel production build together. So approving a merge also approves a production deploy.
*Proposal:* accept that once milestone 1's first production deploy has gone well. The alternative is the sibling's model: production only from GitHub Actions, which still runs on merge, so it's no safer, just more moving parts.

> **Answer (7 Oct 2026):** accepted. A merge to `main` deploys production through the Vercel Git integration (ADR 0004).

**Q23. File links.** Convex file URLs work for anyone who has the link (long and unguessable), until the file is deleted. They only reach signed-in members through authorized queries, but a forwarded link would still open.
*Proposal:* accept this for v1. Before share links or client-facing features, serve files through an authorized endpoint instead.

**Q24. Production domain.** A Clerk production instance needs a domain you own (`clerk.<domain>`), and `*.vercel.app` won't do. Which domain will production use? It's only needed at the end of the cycle, but the sooner the better for Google OAuth.

> **Answer (7 Oct 2026):** no domain while developing. Production stays on https://onova-za-klientite.vercel.app with the Clerk development instance (D50) until the domain is bought.

**Q25. Google OAuth for production.** Production Google sign-in needs your own OAuth client in Google Cloud: consent screen, app name "Онова за клиентите", redirect URI from Clerk. This is a console step only you can do; I'll give you the exact values when we get there.

> **Answer (7 Oct 2026):** Google stays a sign-in option inside Clerk; nothing else handles auth. The development instance signs in with Google through Clerk's shared credentials, so nothing is needed now. Only the Clerk production instance asks for our own Google client ID and secret, so this waits for Q24.

**Q26. Error tracking.** The sibling uses Sentry. Adding it here is a new provider, so it needs your OK.
*Proposal:* not in v1. Rely on Convex logs, `npx convex logs` and Vercel's runtime logs, and revisit before other users join.

## Decisions made during the build

Details the doc doesn't cover, settled here so they can be copied into the living design doc.

| # | Area | Decision | Why |
| --- | --- | --- | --- |
| D1 | Dates | Calendar dates are `"YYYY-MM-DD"` strings in Europe/Sofia. Moments are epoch milliseconds | Due dates and payment dates have no time of day, so storing a moment would shift them across time zones |
| D2 | Time zone | One fixed zone, Europe/Sofia, for "today", months and push times | Bulgaria only. A business time zone field can come later |
| D3 | Job address | Copied from the client when the job is created, then editable | A client moving house must not rewrite where past work was done |
| D4 | Job lines | Stored inside the job document, not as their own table | A job has a handful of lines, and price must change in the same write |
| D5 | Default words | Item: "Обект". Appointment: "Среща". Job line: "Позиция". Client credit: "Предплатено" | The doc names the concepts but not every Bulgarian word. See `CONTEXT.md` |
| D6 | New job price | A price matched from a service fills the typed price. No lines are created from the one-line entry | It keeps the new-job save to two required fields. Lines are added on the job page |
| D7 | Write-off | Stored on the job (`writeOff`), and part of the balance: price − paid − written off | The doc gives the rule but no formula |
| D8 | Search keys | Precomputed `searchText` per record, folded three ways (see Search) | Convex can only search stored text |
| D9 | Phones | E.164 through `libphonenumber-js`, with Bulgaria as the default country | Viber links and later SMS need the full number |
| D10 | Active business | Stored on the user (`activeBusinessId`), not in the URL | Short URLs for a solo user. The switcher appears only with two or more businesses |
| D11 | Vercel region | Functions in `dub1` (Dublin) | Next to Convex in Ireland. Keeps the EU story simple |
| D12 | Convex components | `convex-helpers` (wrappers), `workpool` (push fan-out), `rate-limiter` (uploads, push subscribe, search), `migrations`. All official, with versions pinned. `aggregate` only if counting gets slow | Each solves a problem we have. They are pre-1.0, hence the pins |
| D13 | Scheduled work | Crons are UTC only, so per-person times (07:30 Sofia) are stored as the next UTC moment and picked up by a 15-minute cron. Sofia's daylight-saving offset comes from `shared/dates.ts`, which is tested on both changeover days | The Convex runtime's time-zone support is undocumented |
| D14 | Uploads | Checked on the server after upload against the `_storage` metadata (size, type), and deleted if rejected. A daily cron removes uploads no record points to | Never trust the client's claim about a file |
| D15 | Rendering | SPA mode. No server rendering (ADR 0001, 0010) | Every screen is behind sign-in. A static shell is what opens offline |
| D16 | Errors | Convex throws `ConvexError({ code })`, and the client maps codes to messages | Convex never holds UI text, so translation stays in one place |
| D17 | In-app browsers | Links opened inside Viber or Facebook show "Отворете в Chrome" or "Отворете в Safari" before install or push | In-app browsers can't install a PWA or receive push, and Viber is where links get shared |
| D18 | Photos | Compressed in the browser before upload (long side 2000 px, JPEG) | Phone photos are 3–8 MB and uploads time out after 2 minutes on slow networks |
| D19 | Convex while developing | The team's Free plan. Every dev and preview deployment is disposable and holds only seed data, and so does the Free project's production deployment that Vercel production uses until launch. The real production deployment is created fresh in EU (Ireland) at launch, with the owner's OK, and Vercel's production deploy key is switched to it (Q19, Q21) | Nothing needs keeping until the first user's real data, and a region can't be changed after creation |
| D20 | Excel import | `.xlsx` through `read-excel-file`, CSV through `papaparse`, both lazy-loaded. Legacy `.xls` isn't read: the import screen asks to save the file as `.xlsx` or CSV, which any Excel since 2007 can do (Q20) | The owner chose ordinary npm packages over a vendored SheetJS. Losing `.xls` costs one extra step for an old file |
| D21 | Clerk ↔ Convex | Clerk's session token carries `aud: "convex"`, plus `name`, `email` and `picture` claims, set with `clerk config patch`. That is what Clerk's Convex integration does, and `ConvexProviderWithClerk` then uses the session token directly | The integration's dashboard switch has no CLI equivalent, and the claims are the whole of it |
| D22 | Clerk SDK | `@clerk/tanstack-react-start` works in SPA mode without `clerkMiddleware()`: sign-in, sign-out and reload all work from the static shell. `@clerk/react` isn't needed (spike 1) | Fewer moving parts; the server only serves the shell |
| D23 | Dev seed | Seed businesses carry a `seedKey`. `seed:dev` and `seed:preview` rebuild their contents in place, so ids stay stable and a second run gives the same result. They refuse unless the deployment has `ALLOW_SEED=true`, which production never gets. On such deployments, every user joins the seed businesses at first sign-in | Previews are seeded before anyone signs in, and the Clerk test users must see both businesses |
| D24 | Typed Convex env | Env vars are declared in `convex/convex.config.ts` and read from `env` in `_generated/server`, as the Convex ESLint plugin asks. `auth.config.ts` is the one exception, since it is read at push time | Typos in env names become type errors |
| D25 | Stage delete with jobs | Deleting a stage that holds jobs takes a "move jobs to" stage and moves them in the same mutation. Without one it fails with `stage.hasJobs`. A required group's last stage can't be deleted or regrouped at all | One call for the "Изтрий и премести" button, and no moment where jobs point at a missing stage |
| D26 | Refunds | A refund from a job is limited to what the job was paid. A refund without a job pays back client credit, and can't exceed it | A refund never makes a balance or credit go below what was actually received |
| D27 | Extra field values | A record's extra values are replaced as a whole on edit, except values of archived fields, which are always kept | The form only shows active fields, so archived values would otherwise be lost on every save |
| D28 | Setup and stages | A first run on a business with no jobs swaps its starting stages for the chosen flow's. After that, setup only adds a flow's missing stages, and only when the flow answer changes. Custom stages are never touched | Re-running setup with unchanged answers changes nothing, and a renamed stage list stays as the owner left it |
| D29 | Setup logo | The logo upload lives in Settings → Business (milestone 7), on top of the file uploads from milestone 5. Setup step 1 asks only for the name | Uploads need the server-side file checks (D14) first, and one place to change a logo is enough |
| D30 | One-line services | A service matches the line only when its name equals the typed title (folded). The typed title is always kept as written, with a capital first letter | "гардероб" must not pick up "Гардероб, на линеен метър" and its per-metre price |
| D31 | One-line dates | A day and month without a year that is already past means next year. A one-visit job's date without a time becomes an all-day appointment. A date without a time is never given a made-up hour | "5.01" typed in October means January. A guessed 09:00 would show on Today as a real time |
| D32 | Read-back fixes | A field fixed by hand keeps its fix until the line reads that field differently | Fixing the client, then adding the price to the line, shouldn't lose the client |
| D33 | Today | Sections in this order: today's appointments, overdue, due in 3 days, reminders due, done but unpaid, then the next 7 days of appointments. Empty sections are hidden. The device sends its Sofia date, so the list turns over at local midnight | The design lists the sections but not the order. Action first, then the week ahead |
| D34 | Jobs tabs | Four tabs by stage group, New first, newest first inside a tab. The count line reads "{Jobs}: 5" | New jobs land in New, which is where people look right after "+" |
| D35 | Rejected uploads | `files.save` deletes a rejected blob and returns `{ rejected }` instead of throwing, because a throw would roll back the delete | The blob is gone at once instead of waiting for the daily cleanup |
| D36 | Money screen | One month at a time, the current month first. Received, costs and profit are for the month; still owed, who owes me and credit held are as of now. The month's payments and costs are listed under the figures, so each figure can be checked by hand | The doc lists the figures. The lists make them trustworthy |
| D37 | Payment defaults | A payment from a job defaults to its balance, in cash, dated today. A split from a client defaults to oldest first and every row can be changed. The "Капаро" label is one tap when deposits are on | The common case is one tap, and every default can be changed |
| D38 | Settings roles | Every Settings change is owner-only on the server. Managers and workers see the sections read-only, with one line saying so | Design: Manager has "no business settings" |
| D39 | Grammar check | A unit test reads `messages/bg.json`: a business word may only follow nothing, "+", "Добави", a colon or a gender-free preposition, and `{count}` never comes before one | It turns the design doc's grammar rule into a failing test instead of a review item |
| D40 | Search keys | Every value gives its transliteration. Values with digits (plates, models) also give the plate look-alike fold and a copy without spaces. +359 phones also give the local 0… form. A query with digits is searched twice, plain and as a compact look-alike, and the results merged. Keys are cut at 32 characters | Convex matches whole words except the last, so "СА 1234 ВР" and "CA1234BP" need both forms on each side. Plain names stay free of noise keys |
| D41 | Repeat date | A job's date for repeating is its last non-cancelled appointment, else its due date. A job with neither can't repeat. The next job keeps the appointment's Sofia wall-clock time across daylight saving changes. The cron runs daily at 01:07 UTC | Q6 left "the job's date" open for jobs with both, and off-the-hour crons spread load |
| D42 | Push text | The morning summary's text is built on the server in one file (`convex/lib/pushText.ts`), as "{Срещи}: 2 · Закъснели: 1 · Напомняния: 3" | Push is sent by the server, so ADR 0009's "Convex never returns UI text" has this one exception, kept in one place |
| D43 | Summary rendering | satori is pinned to 0.32.0, the last version that embeds its layout engine. Newer ones fetch an extra `hb.wasm` that Vite serves from the wrong path. Sofia Sans ships as static woff files (Latin and Cyrillic, 400 and 700, 80 KB, OFL) in `public/fonts/`, each subset as its own family | It renders offline from the precached fonts, and digits don't fall back to boxes |
| D44 | Merge | Merging moves jobs, payments, allocations, items, reminders, appointments, files, messages and phones to the kept client. Missing contact details are filled in, and notes are joined. The merged record stays, hidden from lists, with `mergedIntoId` | Nothing is lost, and old links to the merged client still lead somewhere |
| D45 | Account deletion | Businesses where the user is the only active member are deleted table by table in batches of 200 (blobs included). In shared businesses only the membership goes. Then the user, push subscriptions and the Clerk user (Backend API, `CLERK_SECRET_KEY` in Convex env) | Batches stay inside Convex's per-mutation limits, and a shared business isn't destroyed by one leaver |
| D46 | Export | One owner-only query returns every business-scoped table. The browser zips `data.json` plus a UTF-8 CSV with BOM per table (`fflate`, about 8 KB) | Level 1 data fits one query. Excel opens the CSVs with Cyrillic intact |
| D47 | Offline | A cold start without signal renders a read-only app from the last IndexedDB snapshot of the last signed-in user (today, open and done-but-unpaid jobs with details, client contacts), and reloads when the signal returns. While signed in, a mid-session drop shows the banner, and forms refuse to send. Direct taps such as a stage change are still queued by Convex and sent on reconnect | ADR 0010's view offline, edit online, without a sync engine |
| D48 | Accessibility | `--muted-foreground` is darker than the prototype's (oklch 0.49) for AA contrast on muted cards. Full-screen flows use `<main>` and an `<h1>` (screen-reader only where the design has none) | axe-core showed no violations on every screen after these, except the Clerk dev badge |
| D49 | Bundle | Phone display uses the small `libphonenumber-js/min` metadata (`shared/phone-format.ts`). The full metadata is only loaded with the client form. The offline app is lazy-loaded | The main chunk went from 497 KB to 297 KB |
| D50 | Production | Production is the Convex deployment `ideal-shepherd-123` (`aws-eu-west-1`, the project's default prod) behind https://onova-za-klientite.vercel.app, Vercel functions in `dub1`. Until the owner's domain exists (Q24) it signs in through the Clerk **development** instance, with its own VAPID keys. The env switch at launch is listed under "Next" | Everything but the Clerk instance can be tested in production now. There is no user data yet, and dev-instance users don't carry over, so nothing is lost at the switch |
| D51 | "+" line | A phone inside a segment with no commas around it ("Иван 0888123456 маса 250") splits the segment as if they were there. The phone also picks between clients with the same name | The first production check typed exactly that line, and the client was lost into the title |
| D52 | Look and motion | Pages sit on a tinted canvas (`--canvas`) with white cards: the `surface` utility, and `ListCard` for rows divided by lines. Section headings carry a quiet icon and a count; only work that needs attention now (late) is red. Detail pages and Money put each topic in its own `Panel`, heading inside: space separates topics, lines separate rows and columns. Motion is short: a page fades in, rows and cards rise in turn (`stagger`), the active nav item grows a pill, and everything stops under "reduce motion". An icon-only control gets a tooltip (`Tip`, hover and keyboard focus only), and a money term gets a tap-open "i" (`Hint`) that explains it | The owner found the screens flat and hard to read (7 Oct 2026). Tooltips don't open on touch, so the explanations a phone user needs are hints, not tooltips |
| D53 | Stage colour | A stage's colour follows its group: New and In progress blue, Done green, Cancelled red. Only the current stage on a job is filled. Settings → Етапи no longer offers a colour; the stored `color` stays in the data, unused | The owner's call (7 Oct 2026): six free colours read as childish and said nothing the name didn't. Colour now carries meaning only. Changes the design doc's customization table |

## Spikes

Risky bits to try early, in a throwaway branch or the first PR that can reach them:

1. **Milestone 1:** SPA mode with Clerk (`@clerk/tanstack-react-start`, else `@clerk/react`), and the service worker shell opening offline locally.
2. **First preview after Vercel is linked:**
   - `curl -I` on `/sw.js`, `/_shell.html` and the manifest, which must not be cached for a year;
   - the preview's Convex deployment region, which must contain `.eu-west-1.`.
3. **Milestone 8:** a real push to an installed iPhone app and to Android Chrome. Resubscribing when a subscription disappears.
4. **Milestone 9:** satori → canvas → PNG on iOS Safari, and sharing to Viber on both platforms.
5. **Milestone 10:** an airplane-mode cold start on both platforms, and reconnecting across a token refresh.

## Done, next, open

- **Done:**
  - milestones 0–10, merged to `main` on 7 Oct 2026 (#13, #16–#25). What each one built is in its PR;
  - Q19–Q22;
  - Vercel project `onova-za-klientite`, linked to the GitHub repo. A merge to `main` deploys production, and every PR gets a preview with its own Convex preview deployment (ADR 0004, D50);
  - the Convex production deployment `ideal-shepherd-123` in `aws-eu-west-1`, and the first production deploy at https://onova-za-klientite.vercel.app (D50);
  - the CI `e2e` job's GitHub secrets, pointed at the dev deployment and the Clerk development instance.
  - a visual pass: cards on a tinted page, section icons, light motion, tooltips and money hints (D52).
- **Next, with the owner:**
  1. The real-device spikes: push on Android and an installed iPhone app (spike 3), sharing the summary to Viber and contact import (spike 4), an airplane-mode cold start (spike 5).
  2. A real `VAPID_SUBJECT` on production (now `mailto:push@example.com`): the operator's contact address that push services see, not something each user sets.
  3. At launch, once the domain is bought (Q24): the Clerk production instance on it with our own Google OAuth client (Q25), then on Vercel Production the `pk_live_` publishable key, and on the Convex production deployment the production `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY` and `APP_URL`. Backups are decided before real customer data goes in (Q21).
- **Open:**
  - Q23–Q26;
  - the free-tier limits and prices (design doc), and the written СУПТО answer before public launch.
