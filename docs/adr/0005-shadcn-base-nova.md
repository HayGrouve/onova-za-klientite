# ADR 0005: shadcn/ui on Base UI, kept from the prototypes

**Status:** Accepted

## Context

Prototypes 1 and 2 settled the look: shadcn's `base-nova` style on Base UI, Phosphor icons, Sofia Sans Variable (which has proper Bulgarian Cyrillic letterforms under `lang="bg"`), and one ink-blue accent on a zinc base. The sibling app uses Radix and lucide, so its components don't carry over.

## Decision

- `components.json` and the theme tokens in `src/index.css` come from the prototype branch.
- Components are added with `npx shadcn@latest add`, never hand-written. Local changes to registry components stay small and are marked with a comment.
- Phone-size controls are 44–48 px tall with one radius (`rounded-xl`).

## Consequences

- Base UI APIs differ from Radix (`render` instead of `asChild`, `string[]` toggle values). Examples from the wider shadcn ecosystem often assume Radix.
- Pages sit on a tinted canvas with white cards (D52), so form controls are filled white (`bg-card`) instead of transparent, and the default tabs slide one white pill to the active tab. Both are marked local changes.
