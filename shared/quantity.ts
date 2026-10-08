const quantity = new Intl.NumberFormat('bg-BG', {
  useGrouping: false,
  maximumFractionDigits: 10,
})

/** A line's quantity as people write it: "2,5". No grouping, so it can be typed back. */
export function formatQuantity(value: number): string {
  return quantity.format(value)
}

/**
 * A number as people type it: digits with one comma or point, an optional
 * minus, spaces ignored. Nothing `Number()` would read on its own ("1e3",
 * "0x10", "Infinity") counts. `null` when it is not a number.
 */
export function parseDecimal(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.')
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)) return null
  const value = Number(clean)
  return Number.isFinite(value) ? value : null
}

/** A line's quantity: a number above zero, or `null`. */
export function parseQuantity(text: string): number | null {
  const value = parseDecimal(text)
  return value !== null && value > 0 ? value : null
}
