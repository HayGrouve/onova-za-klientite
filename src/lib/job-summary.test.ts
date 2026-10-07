import { describe, expect, it } from 'vitest'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../shared/money'
import {
  formatSummaryDate,
  summaryContacts,
  summaryRows,
  summaryText,
  viberTextHref,
} from './job-summary'
import type { SummaryInput } from './job-summary'

const input: SummaryInput = {
  business: { name: 'Business', phone: '+359 88 123 4567' },
  clientName: 'Client',
  title: 'Kitchen',
  date: '2026-10-07',
  lines: [
    { id: 'a', description: 'Cabinets', quantity: 2.5, unitPriceCents: 15000 },
    { id: 'b', description: 'Fitting', quantity: 1, unitPriceCents: 9999 },
  ],
  priceCents: 47499,
  paidCents: 20000,
  balanceCents: 27499,
}

describe('summaryRows', () => {
  it('gives one row per line with quantity, unit price and total', () => {
    const rows = summaryRows(input.lines)
    expect(rows.map((row) => row.totalCents)).toEqual([37500, 9999])
    expect(rows[0]?.detail).toBe(`2,5 × ${formatMoney(15000)}`)
    expect(rows[0]?.total).toBe(formatMoney(37500))
  })

  it('has no rows for a job with a single price', () => {
    expect(summaryRows([])).toEqual([])
  })

  it('adds up to the job price', () => {
    const sum = summaryRows(input.lines).reduce(
      (total, row) => total + row.totalCents,
      0,
    )
    expect(sum).toBe(input.priceCents)
  })
})

describe('summaryContacts', () => {
  it('keeps only what is filled in', () => {
    expect(
      summaryContacts({
        name: 'x',
        phone: ' 123 ',
        email: '',
        address: undefined,
      }),
    ).toEqual(['123'])
    expect(summaryContacts({ name: 'x' })).toEqual([])
  })
})

describe('formatSummaryDate', () => {
  it('writes day, month, year', () => {
    expect(formatSummaryDate('2026-10-07')).toBe('07.10.2026')
  })
})

describe('summaryText', () => {
  it('has the title, price, paid, balance and the not-an-invoice line', () => {
    const lines = summaryText(input).split('\n')
    expect(lines).toEqual([
      'Kitchen',
      `${m.job_price()}: ${formatMoney(47499)}`,
      `${m.job_paid()}: ${formatMoney(20000)}`,
      `${m.job_balance()}: ${formatMoney(27499)}`,
      m.summary_not_invoice(),
    ])
  })
})

describe('viberTextHref', () => {
  it('encodes the text for viber://forward', () => {
    const href = viberTextHref('a b\nc&d')
    expect(href).toBe('viber://forward?text=a%20b%0Ac%26d')
  })
})
