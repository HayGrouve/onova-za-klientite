# ADR 0006: Business is the authorization scope

**Status:** Accepted

## Context

A person can belong to several businesses, and Level 2 adds Managers and Workers to a business. Every record belongs to exactly one business. The client must never be trusted with a business id or a user id.

## Decision

- Every table except `users` carries `businessId`.
- Every public Convex function goes through one of a few wrappers (`businessQuery`, `businessMutation`), built with `convex-helpers` `customQuery` and `customMutation`. The wrapper takes `businessId` as an argument, resolves the caller from the auth token, loads their active Membership in that business and passes it on as `ctx.member`. Without a membership the call fails.
- Loading a document by id goes through `getOwned(ctx, id)`, which also checks that its `businessId` matches.
- Role checks (Owner, Manager, Worker) live in the same helpers. Level 1 always has an Owner, but the checks are written from the start.

## Consequences

- No function reads data by a bare id. `@convex-dev/eslint-plugin`'s `require-access-control` rule, plus a test that calls every public function as a stranger, keep it that way.
- Scheduled and cron functions get no auth. They are `internal` only and take ids from the code that scheduled them.
- Moving data between businesses is not supported.
