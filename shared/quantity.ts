const quantity = new Intl.NumberFormat('bg-BG', {
  useGrouping: false,
  maximumFractionDigits: 10,
})

/** A line's quantity as people write it: "2,5". No grouping, so it can be typed back. */
export function formatQuantity(value: number): string {
  return quantity.format(value)
}
