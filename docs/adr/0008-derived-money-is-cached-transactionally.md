# ADR 0008: Calculated values are cached and recomputed in the same transaction

**Status:** Accepted

## Context

The design doc says price, balance, client credit and profit are calculated, never typed. Lists like "who owes me" and "done but unpaid" need to filter and sort by balance across all of a business's jobs, and Convex can only index stored fields.

## Decision

- Jobs store `priceCents`, `paidCents`, `costCents`, `balanceCents` and an `owes` flag. Clients store `creditCents`. These are caches the user can never write.
- They are recomputed from their sources (lines, allocations, costs, write-off) by one domain function, `recomputeJob` or `recomputeClient`, in the same mutation that changed a source. Nothing else writes them.
- Flags that depend on today's date (overdue, due soon, reminder due) are not stored. They are computed at read time from indexed dates.
- A test helper recomputes every cache from scratch and compares it with what is stored. Property tests and every mutation test run it.

## Consequences

- Any new mutation that touches lines, payments, allocations or costs must call the recompute function. The cache check in tests catches a missed call.
- Amended (8 Oct 2026): mutations no longer call recompute themselves. Every write to payments, allocations, costs and the job fields money is computed from goes through `convex/lib/ledger.ts` (`insertJob`, `patchJob`, `recordPayment`, `payJob`, `spendCredit`, `rewritePayment`, `removePayment`, the cost writers and `moveClientMoney`). Each of these refreshes what it touched. An ESLint rule rejects raw writes to those tables, and imports of `recompute`, anywhere else in `convex/`.
- A one-off internal function can rebuild every cache if a bug ever corrupts one.
- Amended (D105, D106): the ledger's `insertJob` and `patchJob` also keep what is derived from the jobs: the per-group and per-stage job counts (`jobCounts`) and the Worker assignment rows (`jobAssignments`). `internal.counts.backfill` rebuilds both. ESLint rejects raw writes to the job fields they copy, and imports of `convex/lib/jobIndex` outside the ledger.
