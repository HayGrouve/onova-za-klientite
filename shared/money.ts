const CURRENCY = /€|евро|eur/gi
const SPACES = /\s/g

const formatter = new Intl.NumberFormat('bg-BG', {
  style: 'currency',
  currency: 'EUR',
})
const wholeFormatter = new Intl.NumberFormat('bg-BG', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Integer euro cents from what a person typed, or null when it is not an amount. */
export function parseMoney(input: string): number | null {
  let text = input.replace(CURRENCY, '').replace(SPACES, '')
  let negative = false
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true
    text = text.slice(1)
  }
  if (!/^\d[\d.,]*$/.test(text)) return null

  let intPart = text
  let fraction = ''
  const decimal = /^(.*\d)([.,])(\d{1,2})$/.exec(text)
  if (decimal) {
    intPart = decimal[1]
    fraction = decimal[3]
    if (/^\d{1,3}([.,]\d{3})+$/.test(intPart)) {
      // Thousands separators must differ from the decimal separator
      if (intPart.includes(decimal[2])) return null
    } else if (!/^\d+$/.test(intPart)) {
      return null
    }
  } else if (
    !/^\d+$/.test(text) &&
    !/^\d{1,3}(\.\d{3})+$/.test(text) &&
    !/^\d{1,3}(,\d{3})+$/.test(text)
  ) {
    return null
  }

  const euros = Number(intPart.replace(/[.,]/g, ''))
  const cents = euros * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative && cents !== 0 ? -cents : cents
}

/** "950 €" for whole amounts, "1200,50 €" otherwise. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const rest = abs % 100
  const decimal = `${sign}${euros}.${String(rest).padStart(2, '0')}`
  // The string form keeps large amounts exact
  return (rest === 0 ? wholeFormatter : formatter).format(
    decimal as unknown as number,
  )
}

/** The digits of an amount for an input: 1200,5 → "1200,50", without the € sign. */
export function moneyInputText(cents: number | null | undefined): string {
  return cents === null || cents === undefined
    ? ''
    : formatMoney(cents).replace(/\s?€/, '')
}

/** round(quantity x unit price), half away from zero. */
export function lineTotalCents(
  quantity: number,
  unitPriceCents: number,
): number {
  const product = quantity * unitPriceCents
  const abs = Math.abs(product)
  const floor = Math.floor(abs)
  // The epsilon absorbs float error such as 2.675 * 100 = 267.49999999999997
  const rounded = abs - floor >= 0.5 - 1e-9 ? floor + 1 : floor
  return product < 0 ? -rounded : rounded
}

export function sumCents(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

export function isCents(value: number): boolean {
  return Number.isSafeInteger(value)
}
