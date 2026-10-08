import { describe, expect, it } from 'vitest'
import { exampleLine, parseDate, parseLine } from './parse-line'
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

  it('a phone without commas splits the line: name, phone, title, price', () => {
    const parsed = parse('Петър 0899 111 222 етажерка 250 лв')
    expect(parsed.client).toEqual({
      kind: 'new',
      name: 'Петър',
      phone: '0899 111 222',
    })
    expect(parsed.title).toBe('етажерка')
    expect(parsed.priceCents).toBe(25000)
  })

  it('a phone without commas finds the client it belongs to', () => {
    const parsed = parse('Иван 0888123456 маса 250')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.title).toBe('маса')
    expect(parsed.priceCents).toBe(25000)
  })

  it('the phone picks between two clients with the same name', () => {
    const parsed = parseLine('Иван, 0888 123 456, шкаф', {
      ...ctx,
      clients: [
        { id: 'ivan2', name: 'Иван Колев', phones: [] },
        ...ctx.clients,
      ],
    })
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.candidates).toEqual([])
  })

  it('international and landline numbers split out too', () => {
    expect(parse('Петър +359 899 111 222 шкаф').client).toEqual({
      kind: 'new',
      name: 'Петър',
      phone: '+359 899 111 222',
    })
    expect(parse('Петър 02 987 6543 шкаф').title).toBe('шкаф')
  })

  it('a price after the phone stays a price', () => {
    const parsed = parse('Петър 0899 111 222 300')
    expect(parsed.priceCents).toBe(30000)
  })

  it('numbers that are not a phone stay in the title', () => {
    const parsed = parse('Мария Георгиева, плот 120 60 3')
    expect(parsed.title).toContain('плот')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'maria' })
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

describe('parseLine: the phone and the client', () => {
  it('shows the phone it captured, whoever the client is', () => {
    expect(parse('Петър Колев, 0899 111 222, етажерка').phone).toBe(
      '0899 111 222',
    )
    expect(parse('Иван Петров, 0888 123 456, шкаф').phone).toBe('0888 123 456')
    expect(parse('Иван Петров, шкаф').phone).toBeNull()
  })

  it('names the client a typed phone already belongs to', () => {
    expect(parse('Петър Колев, 0888 123 456, шкаф').phoneOwner?.id).toBe('ivan')
    expect(parse('Иван Петров, 0888 123 456, шкаф').phoneOwner?.id).toBe('ivan')
    expect(parse('Петър Колев, 0899 111 222, шкаф').phoneOwner).toBeNull()
    expect(parse('Иван Петров, шкаф').phoneOwner).toBeNull()
  })

  it('a phone that belongs to a client picks them, with or without a name', () => {
    expect(parse('0888 123 456, шкаф').client).toEqual({
      kind: 'existing',
      id: 'ivan',
    })
    expect(parse('Иван Петров, 0888 123 456, шкаф').client).toEqual({
      kind: 'existing',
      id: 'ivan',
    })
  })

  it('a new name with a phone that is somebody else’s picks the phone’s owner and keeps the name', () => {
    const parsed = parse('Петър Колев, 0888 123 456, етажерка')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.typedName).toBe('Петър Колев')
    expect(parsed.title).toBe('етажерка')
    expect(parsed.phone).toBe('0888 123 456')
  })

  it('without commas too', () => {
    const parsed = parse('Петър 0888123456 етажерка 250')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.typedName).toBe('Петър')
    expect(parsed.title).toBe('етажерка')
    expect(parsed.priceCents).toBe(25000)
  })

  it('a name of one client with the phone of another offers both', () => {
    const parsed = parse('Мария Георгиева, 0888 123 456, шкаф')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.candidates.map((client) => client.id)).toEqual([
      'ivan',
      'maria',
    ])
    expect(parsed.typedName).toBeNull()
  })

  it('a phone nobody has stays with the new client', () => {
    const parsed = parse('Петър Колев, 0899 111 222, етажерка')
    expect(parsed.client).toEqual({
      kind: 'new',
      name: 'Петър Колев',
      phone: '0899 111 222',
    })
    expect(parsed.typedName).toBeNull()
  })

  it('a title with a known phone does not turn into a name', () => {
    const parsed = parse('ремонт на стол, 0888 123 456')
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.title).toBe('ремонт на стол')
    expect(parsed.typedName).toBeNull()
  })

  it('a new name a typo or two from a client offers that client', () => {
    const parsed = parse('Иван Петрв, шкаф')
    expect(parsed.client).toEqual({ kind: 'new', name: 'Иван Петрв' })
    expect(parsed.similar.map((client) => client.id)).toEqual(['ivan'])
  })

  it('a typo in Latin, a missing letter and a swapped pair are found too', () => {
    expect(parse('Ivan Petrv, шкаф').similar.map((c) => c.id)).toEqual(['ivan'])
    expect(parse('Иван Птров, шкаф').similar.map((c) => c.id)).toEqual(['ivan'])
    expect(parse('Мария Геогиева, шкаф').similar.map((c) => c.id)).toEqual([
      'maria',
    ])
    expect(parse('Мраия Георгиева, шкаф').similar.map((c) => c.id)).toEqual([
      'maria',
    ])
  })

  it('a name that is really new offers nobody', () => {
    expect(parse('Петър Колев, шкаф').similar).toEqual([])
    expect(parse('Ана, шкаф').similar).toEqual([])
  })

  it('an existing client or a walk-in offers nobody', () => {
    expect(parse('Иван Петров, шкаф').similar).toEqual([])
    expect(parse('Без клиент, шкаф').similar).toEqual([])
  })
})

describe('parseLine: money', () => {
  it.each([
    ['Иван Петров, гардероб, 1 200', 120000],
    ['Иван Петров, гардероб, 1200,50', 120050],
    ['Иван Петров, гардероб, 950 €', 95000],
    ['Иван Петров, гардероб, 950 евро', 95000],
    ['Иван Петров, гардероб 950', 95000],
    ['Иван Петров, гардероб, 950 лв', 95000],
    ['Иван Петров, гардероб, 950 лева', 95000],
  ])('%s → %i cents', (text, cents) => {
    expect(parse(text).priceCents).toBe(cents)
  })

  it.each([
    'капаро 300',
    'аванс 300',
    'предплата 300',
    'Предплата: 300 €',
    '300 капаро',
    '300 предплата',
    'капаро: 300 €',
  ])('deposit written as "%s"', (deposit) => {
    expect(parse(`Иван Петров, гардероб, 950, ${deposit}`).depositCents).toBe(
      30000,
    )
  })

  it('a spaced thousands price reads whole, with or without commas around it', () => {
    for (const text of [
      'Иван Петров, гардероб, 1 200 €',
      'Иван Петров, гардероб 1 200 €',
      'Иван Петров гардероб 1 200 €, капаро 300',
      'Иван Петров, гардероб, капаро 300, 1 200',
    ]) {
      const parsed = parse(text)
      expect(parsed.priceCents, text).toBe(120000)
      expect(parsed.title, text).toBe('гардероб')
    }
    expect(parse('Иван Петров, гардероб, 12 500 лв').priceCents).toBe(1250000)
  })

  it('a deposit inside the title segment is peeled off', () => {
    const parsed = parse('Иван Петров, гардероб 950 капаро 300')
    expect(parsed.title).toBe('гардероб')
    expect(parsed.priceCents).toBe(95000)
    expect(parsed.depositCents).toBe(30000)
  })

  it('a prepayment inside the title segment is peeled off too', () => {
    const parsed = parse('Иван Петров, гардероб 950 предплата 300')
    expect(parsed.title).toBe('гардероб')
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
    ['срок 20.10', { date: '2026-10-20' }],
    ['срок 20 октомври', { date: '2026-10-20' }],
    ['до 20 октомври', { date: '2026-10-20' }],
    ['20 окт', { date: '2026-10-20' }],
    ['20 окт.', { date: '2026-10-20' }],
    ['на 3 декември', { date: '2026-12-03' }],
    ['до 20 октомври 2027', { date: '2027-10-20' }],
    ['до 5 януари', { date: '2027-01-05' }],
    ['до 1 октомври', { date: '2027-10-01' }],
    ['до 7 октомври', { date: '2026-10-07' }],
    ['до 31 април', null],
    [
      '20 октомври в 14:30',
      { date: '2026-10-20', time: { hour: 14, minute: 30 } },
    ],
    ['за 3 седмици', { date: '2026-10-28' }],
    ['след 10 дни', { date: '2026-10-17' }],
    ['за 10 дни', { date: '2026-10-17' }],
    ['за седмица', null],
    ['след седмица', { date: '2026-10-14' }],
    ['за 2 месеца', { date: '2026-12-07' }],
    ['следващия петък', { date: '2026-10-16' }],
    ['до следващия петък', { date: '2026-10-16' }],
    ['следващият понеделник', { date: '2026-10-12' }],
    ['следващата сряда', { date: '2026-10-14' }],
    ['следващата неделя', { date: '2026-10-18' }],
    [
      'следващия петък в 10',
      { date: '2026-10-16', time: { hour: 10, minute: 0 } },
    ],
  ])('"%s"', (segment, date) => {
    expect(parse(`Иван Петров, шкаф, ${segment}`).date).toEqual(date)
  })

  it('the same phrases inside the title segment come off the end', () => {
    for (const [tail, date] of [
      ['до 20 октомври', '2026-10-20'],
      ['20 окт', '2026-10-20'],
      ['за 3 седмици', '2026-10-28'],
      ['след 10 дни', '2026-10-17'],
      ['до следващия петък', '2026-10-16'],
      ['срок 20 октомври 2027', '2027-10-20'],
    ] as const) {
      const parsed = parse(`Иван Петров, шкаф 950 ${tail}`)
      expect(parsed.date, tail).toEqual({ date })
      expect(parsed.title, tail).toBe('шкаф')
      expect(parsed.priceCents, tail).toBe(95000)
    }
  })

  it('a date never gets a made-up hour (D31)', () => {
    expect(
      parse('Иван Петров, шкаф, до 20 октомври').date?.time,
    ).toBeUndefined()
    expect(
      parse('Иван Петров, шкаф, следващия петък').date?.time,
    ).toBeUndefined()
  })

  it('"следващия петък" is the Friday of the next calendar week', () => {
    // Mon 5 Oct … Sun 11 Oct 2026: every day of that week gives Friday 16 Oct.
    for (const today of [
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]) {
      expect(parseDate('следващия петък', today), today).toEqual({
        date: '2026-10-16',
      })
    }
    // Plain "петък" on a Friday is still a week away; the next Monday is the one after Sunday.
    expect(parseDate('петък', '2026-10-09')).toEqual({ date: '2026-10-16' })
    expect(parseDate('следващия понеделник', '2026-10-11')).toEqual({
      date: '2026-10-12',
    })
  })

  it('an impossible date is not a date', () => {
    expect(parse('Иван Петров, шкаф, 31.02').date).toBeNull()
  })
})

describe('parseLine: money already received', () => {
  const walkIn = 'Без клиент, зареждане с фреон, 40'

  it.each([
    'платено 40',
    'платено: 40 €',
    'платих 40',
    'получих 40',
    'в брой 40',
    '40 в брой',
    '40 платено',
    'платено 40 в брой',
  ])('"%s" is a payment, not a deposit and not the price', (paid) => {
    const parsed = parse(`${walkIn}, ${paid}`)
    expect(parsed.client).toEqual({ kind: 'none' })
    expect(parsed.title).toBe('зареждане с фреон')
    expect(parsed.priceCents).toBe(4000)
    expect(parsed.paid).toEqual({ cents: 4000 })
    expect(parsed.depositCents).toBeNull()
  })

  it('a payment with no price makes the price: it is what the work cost', () => {
    const parsed = parse('Без клиент, зареждане с фреон, платено 40')
    expect(parsed.priceCents).toBe(4000)
    expect(parsed.paid).toEqual({ cents: 4000 })
  })

  it('a payment does not replace a price from the service list (D6)', () => {
    const parsed = parse('Мария Георгиева, профилактика, платих 30')
    expect(parsed.service?.id).toBe('service')
    expect(parsed.priceCents).toBeNull()
    expect(parsed.paid).toEqual({ cents: 3000 })
  })

  it('"платено" alone means the whole price, wherever it stands', () => {
    for (const text of [
      `${walkIn}, платено`,
      'Без клиент, зареждане с фреон, платено, 40',
      'Без клиент, 40, зареждане с фреон платено',
      `${walkIn}, платено в брой`,
      `${walkIn}, платили`,
      `${walkIn}, в брой`,
    ]) {
      const parsed = parse(text)
      expect(parsed.paid, text).toEqual({ cents: null })
      expect(parsed.priceCents, text).toBe(4000)
      expect(parsed.title, text).toBe('зареждане с фреон')
    }
  })

  it('"платено" without any price has nothing to pay yet', () => {
    const parsed = parse('Без клиент, зареждане с фреон, платено')
    expect(parsed.paid).toEqual({ cents: null })
    expect(parsed.priceCents).toBeNull()
  })

  it('a payment inside the title segment is peeled off', () => {
    const parsed = parse('Без клиент, зареждане с фреон 40 платено 40')
    expect(parsed.title).toBe('зареждане с фреон')
    expect(parsed.priceCents).toBe(4000)
    expect(parsed.paid).toEqual({ cents: 4000 })
  })

  it('"40 платено" inside the title segment is a payment of 40, which is also the price', () => {
    const parsed = parse('Без клиент, зареждане с фреон 40 платено')
    expect(parsed.title).toBe('зареждане с фреон')
    expect(parsed.priceCents).toBe(4000)
    expect(parsed.paid).toEqual({ cents: 4000 })
  })

  it('a part payment is still a payment, with the price kept apart', () => {
    const parsed = parse('Иван Петров, гардероб, 950, платих 400')
    expect(parsed.priceCents).toBe(95000)
    expect(parsed.paid).toEqual({ cents: 40000 })
    expect(parse('Иван Петров, гардероб, 400 в брой, 950').paid).toEqual({
      cents: 40000,
    })
  })

  it('a deposit is not a payment, and the first one wins', () => {
    const deposit = parse('Иван Петров, гардероб, 950, капаро 300')
    expect(deposit.paid).toBeNull()
    expect(deposit.depositCents).toBe(30000)
    const both = parse('Иван Петров, гардероб, 950, капаро 300, платено 650')
    expect(both.depositCents).toBe(30000)
    expect(both.paid).toBeNull()
  })

  it('a second payment stays in the title, where it can be seen, and is not read as the price', () => {
    const parsed = parse('Иван Петров, ремонт, капаро 20, платено 20')
    expect(parsed.depositCents).toBe(2000)
    expect(parsed.paid).toBeNull()
    expect(parsed.priceCents).toBeNull()
    expect(parsed.title).toBe('ремонт, платено 20')
    const reverse = parse('Иван Петров, ремонт, платено 20, капаро 20')
    expect(reverse.paid).toEqual({ cents: 2000 })
    expect(reverse.depositCents).toBeNull()
    expect(reverse.title).toBe('ремонт, капаро 20')
  })

  it('a deposit paid in cash keeps "в брой" out of the title', () => {
    for (const text of [
      'Иван Петров, гардероб, 950, капаро 300 в брой',
      'Иван Петров, гардероб 950 капаро 300 в брой',
    ]) {
      const parsed = parse(text)
      expect(parsed.depositCents, text).toBe(30000)
      expect(parsed.paid, text).toBeNull()
      expect(parsed.title, text).toBe('гардероб')
    }
  })

  it('a title that only mentions money words stays a title', () => {
    for (const title of ['платена реклама', 'платен паркинг']) {
      const parsed = parse(`Иван Петров, ${title}, 100`)
      expect(parsed.paid, title).toBeNull()
      expect(parsed.title, title).toBe(title)
    }
  })

  it('a line without any payment has none', () => {
    expect(parse('Иван Петров, гардероб, 950').paid).toBeNull()
  })
})

describe('parseLine: services', () => {
  it('a title matching a service brings its price (D6)', () => {
    const parsed = parse('Мария Георгиева, профилактика')
    expect(parsed.service?.id).toBe('service')
    expect(parsed.priceCents).toBeNull()
  })

  it('only an exact service name matches', () => {
    const parsed = parseLine('Мария Георгиева, гардероб', {
      ...ctx,
      services: [
        { id: 'm', name: 'Гардероб, на линеен метър', priceCents: 35000 },
      ],
    })
    expect(parsed.service).toBeNull()
    expect(parsed.title).toBe('гардероб')
  })

  it('a typed price wins over the service price', () => {
    expect(parse('Мария Георгиева, монтаж, 60').priceCents).toBe(6000)
  })
})

describe('exampleLine', () => {
  const settings = {
    services: ctx.services,
    deposits: true,
    flow: 'multi' as const,
  }

  it('is a plain total, like the design doc’s example', () => {
    expect(
      exampleLine({ ...settings, services: [] }, 'Иван Петров', 'гардероб'),
    ).toBe('Иван Петров, гардероб, 950, капаро 300, до петък')
  })

  it('is read back the way it reads', () => {
    const line = exampleLine(
      { services: ctx.services, deposits: true, flow: 'single' },
      'Иван Петров',
    )
    const parsed = parse(line)
    expect(parsed.client).toEqual({ kind: 'existing', id: 'ivan' })
    expect(parsed.title).toBe('профилактика')
    expect(parsed.priceCents).not.toBeNull()
    expect(parsed.depositCents).not.toBeNull()
    expect(parsed.depositCents!).toBeLessThan(parsed.priceCents!)
    expect(parsed.date?.time).toEqual({ hour: 10, minute: 0 })
  })

  it('takes a plain service’s name and price as the total', () => {
    expect(
      exampleLine(
        { services: ctx.services, deposits: false, flow: 'multi' },
        'Иван Петров',
      ),
    ).toBe('Иван Петров, профилактика, 50, до петък')
  })

  it('never teaches a per-metre price as a total', () => {
    const perMetre = [
      { id: 'm', name: 'Кухня, на линеен метър', priceCents: 42000 },
    ]
    const line = exampleLine(
      { services: perMetre, deposits: true, flow: 'multi' },
      'Иван Петров',
      'ремонт',
    )
    expect(line).not.toContain('метър')
    expect(line).not.toContain('420')
    const parsed = parse(line)
    expect(parsed.title).toBe('ремонт')
    expect(parsed.priceCents).toBe(95000)
    expect(parsed.depositCents).toBe(30000)
  })

  it('a deposit is always less than the total', () => {
    for (const priceCents of [1000, 2500, 5000, 30000, 250000]) {
      const line = exampleLine(
        {
          services: [{ id: 's', name: 'Услуга', priceCents }],
          deposits: true,
          flow: 'single',
        },
        'Иван Петров',
      )
      const parsed = parse(line)
      expect(parsed.priceCents, line).toBe(priceCents)
      expect(parsed.depositCents!, line).toBeGreaterThan(0)
      expect(parsed.depositCents!, line).toBeLessThan(priceCents)
    }
  })
})
