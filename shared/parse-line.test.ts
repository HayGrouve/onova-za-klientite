import { describe, expect, it } from 'vitest'
import { exampleLine, parseLine } from './parse-line'
import type { ParseContext } from './parse-line'

// Wednesday 7 October 2026.
const TODAY = '2026-10-07'

const ctx: ParseContext = {
  today: TODAY,
  clients: [
    { id: 'ivan', name: 'Иван Петров', phones: ['+359888123456'] },
    { id: 'maria', name: 'Мария Георгиева', phones: ['+359887654321'] },
    { id: 'hotel', name: 'Хотел Морско око', phones: [] },
  ],
  services: [
    { id: 'mount', name: 'Монтаж', priceCents: 4000 },
    { id: 'service', name: 'Профилактика', priceCents: 5000 },
  ],
  noClientName: 'Без клиент',
}

const parse = (text: string) => parseLine(text, ctx)

describe('parseLine: the design doc example', () => {
  it('"Иван Петров, гардероб, 950, капаро 300, до 20.10"', () => {
    const parsed = parse('Иван Петров, гардероб, 950, капаро 300, до 20.10')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.title).toBe('гардероб')
    expect(parsed.priceCents).toBe(95000)
    expect(parsed.depositCents).toBe(30000)
    expect(parsed.date).toEqual({ date: '2026-10-20' })
  })
})

describe('parseLine: client', () => {
  it('finds an existing client in Latin', () => {
    expect(parse('ivan petrov, шкаф').client).toEqual({
      kind: 'existing',
      id: 'ivan',
    })
  })

  it('a capitalised name that is not a client becomes a new client', () => {
    expect(parse('Петър Колев, етажерка, 300').client).toEqual({
      kind: 'new',
      name: 'Петър Колев',
    })
  })

  it('a phone number finds the client it belongs to', () => {
    expect(parse('0888 123 456, профилактика').client).toEqual({
      kind: 'existing',
      id: 'ivan',
    })
  })

  it('a new client keeps the phone typed with them', () => {
    expect(parse('Петър Колев, 0899 111 222, етажерка').client).toEqual({
      kind: 'new',
      name: 'Петър Колев',
      phone: '0899 111 222',
    })
  })

  it('"Без клиент" picks the built-in walk-in client', () => {
    expect(parse('без клиент, ключ, 10').client).toEqual({ kind: 'none' })
  })

  it('without commas, the longest leading run of words that is a client', () => {
    const parsed = parse('Мария Георгиева кухня 3400 утре')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'maria' })
    expect(parsed.title).toBe('кухня')
    expect(parsed.priceCents).toBe(340000)
    expect(parsed.date).toEqual({ date: '2026-10-08' })
  })

  it('several matches are offered as candidates', () => {
    const many = parseLine('Иван, шкаф', {
      ...ctx,
      clients: [
        ...ctx.clients,
        { id: 'ivan2', name: 'Иван Колев', phones: [] },
      ],
    })
    expect(many.candidates.map((client) => client.id)).toEqual([
      'ivan',
      'ivan2',
    ])
  })

  it('a lower-case first word is the title, not a client', () => {
    const parsed = parse('ремонт на стол, 80')
    expect(parsed.client).toBeNull()
    expect(parsed.title).toBe('ремонт на стол')
  })
})

describe('parseLine: money', () => {
  it.each([
    ['Иван Петров, гардероб, 1 200', 120000],
    ['Иван Петров, гардероб, 1200,50', 120050],
    ['Иван Петров, гардероб, 950 €', 95000],
    ['Иван Петров, гардероб, 950 евро', 95000],
    ['Иван Петров, гардероб 950', 95000],
  ])('%s → %i cents', (text, cents) => {
    expect(parse(text).priceCents).toBe(cents)
  })

  it.each(['капаро 300', 'аванс 300', '300 капаро', 'капаро: 300 €'])(
    'deposit written as "%s"',
    (deposit) => {
      expect(parse(`Иван Петров, гардероб, 950, ${deposit}`).depositCents).toBe(
        30000,
      )
    },
  )

  it('a deposit inside the title segment is peeled off', () => {
    const parsed = parse('Иван Петров, гардероб 950 капаро 300')
    expect(parsed.title).toBe('гардероб')
    expect(parsed.priceCents).toBe(95000)
    expect(parsed.depositCents).toBe(30000)
  })
})

describe('parseLine: dates', () => {
  it.each([
    ['днес', { date: '2026-10-07' }],
    ['утре', { date: '2026-10-08' }],
    ['вдругиден', { date: '2026-10-09' }],
    ['в петък', { date: '2026-10-09' }],
    ['сряда', { date: '2026-10-14' }],
    ['пон', { date: '2026-10-12' }],
    ['до 20.10', { date: '2026-10-20' }],
    ['20/10/2027', { date: '2027-10-20' }],
    ['5.01', { date: '2027-01-05' }],
    ['след 2 седмици', { date: '2026-10-21' }],
    ['след месец', { date: '2026-11-07' }],
    ['след три дни', { date: '2026-10-10' }],
    ['утре 10:00', { date: '2026-10-08', time: { hour: 10, minute: 0 } }],
    ['в петък в 14', { date: '2026-10-09', time: { hour: 14, minute: 0 } }],
    ['днес 9:30ч', { date: '2026-10-07', time: { hour: 9, minute: 30 } }],
  ])('"%s"', (segment, date) => {
    expect(parse(`Иван Петров, шкаф, ${segment}`).date).toEqual(date)
  })

  it('an impossible date is not a date', () => {
    expect(parse('Иван Петров, шкаф, 31.02').date).toBeNull()
  })
})

describe('parseLine: services', () => {
  it('a title matching a service brings its price (D6)', () => {
    const parsed = parse('Мария Георгиева, профилактика')
    expect(parsed.service?.id).toBe('service')
    expect(parsed.priceCents).toBeNull()
  })

  it('a typed price wins over the service price', () => {
    expect(parse('Мария Георгиева, монтаж, 60').priceCents).toBe(6000)
  })
})

describe('exampleLine', () => {
  it('is read back the way it reads', () => {
    const line = exampleLine(
      { services: ctx.services, deposits: true, flow: 'single' },
      'Иван Петров',
    )
    const parsed = parse(line)
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.service?.id).toBe('service')
    expect(parsed.depositCents).toBe(10000)
    expect(parsed.date?.time).toEqual({ hour: 10, minute: 0 })
  })
})
