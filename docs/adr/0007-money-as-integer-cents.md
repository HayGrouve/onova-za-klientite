# ADR 0007: Money as integer euro cents

**Status:** Accepted

## Context

The prototypes kept money as floats. The app does sums, splits and refunds, where float rounding produces wrong balances, such as 0.1 + 0.2. EUR is the only currency.

## Decision

- Every amount is stored and computed as an integer number of euro cents (`amountCents`, `priceCents`). Validators reject non-integers.
- A line total is `round(quantity × unitPriceCents)`, rounded half away from zero, once per line. A job price is the sum of its line totals.
- Parsing and display are pure functions in `shared/money.ts`. Input accepts "1 200", "1200,50" and "1200.50". Display uses `Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" })`.
- The money math gets property tests with fast-check, for example "allocations never exceed the payment" and "balance + allocated + written off = price".

## Consequences

- Quantities may be decimal (2.5 m²), but amounts never are.
- There is no currency field. Another currency would need a migration, which is fine because EUR-only is a product decision.
