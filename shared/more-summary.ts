/** One folded part of a detail page: its name, and how many it holds when that is known. */
export type MorePart = { name: string; count?: number }

/** How many parts the closed card names before "and N more". */
export const MORE_SHOWN = 3

/**
 * What a closed "More" card says about what is inside: the parts that hold
 * something first, in their order, then the empty or uncounted ones, cut to a
 * few so the line never needs clipping. `hidden` is how many were left out.
 */
export function summarizeMore(
  parts: MorePart[],
  limit = MORE_SHOWN,
): { shown: MorePart[]; hidden: number } {
  const filled = parts.filter((part) => (part.count ?? 0) > 0)
  const rest = parts.filter((part) => (part.count ?? 0) <= 0)
  const ordered = [...filled, ...rest]
  const shown = ordered.slice(0, limit)
  return { shown, hidden: ordered.length - shown.length }
}
