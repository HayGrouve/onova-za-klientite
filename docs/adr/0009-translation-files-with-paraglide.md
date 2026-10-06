# ADR 0009: Every UI string in translation files, with Paraglide JS

**Status:** Proposed

## Context

The UI is Bulgarian only, but the design doc wants other languages to be addable later without rework, so no string may be hard-coded in a component. The sibling app hard-codes its Bulgarian, so there's nothing to reuse. Some strings contain the business's own words ("+ Ремонт", "Ремонти: 5"), which the user picks with their gender.

## Decision

- [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (`@inlang/paraglide-js`) with `baseLocale: "bg"` and no URL locale strategy. Messages live in `messages/bg.json` and compile to typed functions (`m.jobs_count({ jobs, count })`). Unused messages tree-shake away. TanStack documents a Start integration.
- Plurals use `Intl.PluralRules("bg")` through Paraglide's variants. Bulgarian has two categories, `one` and `other`.
- The business's words are passed into messages as parameters: `{ singular, plural }`, already resolved for the case. Copy is written so that no gendered adjective and no number comes before them (design doc, "Names and Bulgarian grammar"). The stored gender is available as a variant selector, but v1 copy doesn't use it.
- Convex never returns UI text. Errors are `ConvexError({ code: "stage.hasJobs", … })`, and the client turns the code into a message.
- A Vitest check fails if a component under `src/` contains Cyrillic outside `messages/`.

## Considered options

- **Plain typed TS dictionary:** no dependency, but plurals, parameters and the path to more languages are all hand-rolled.
- **Lingui:** ICU and `.po` files are good for translators, but its macros need a Babel plugin under Vite 8.
- **i18next:** mature, but heavier, and typed keys need module augmentation.

## Consequences

- Copy reviews happen in `messages/bg.json`, not scattered through components.
- Paraglide's plural syntax in JSON is verbose. Small helpers in `src/i18n/` keep components readable.
