import { describe, expect, it } from 'vitest'
import { readDraft, saveArgs, startFixes } from './new-job-draft'
import type { DraftContext, DraftFixes } from './new-job-draft'
import { parseLine } from './parse-line'
import type { ParseContext } from './parse-line'

// Wednesday 7 October 2026.
const TODAY = '2026-10-07'

const parseCtx: ParseContext = {
  today: TODAY,
  clients: [
    { id: 'ivan', name: 'Иван Петров', phones: ['+359888123456'] },
    { id: 'maria', name: 'Мария Георгиева', phones: ['+359887654321'] },
  ],
  services: [{ id: 'service', name: 'Профилактика', priceCents: 5000 }],
  noClientName: 'Без клиент',
}

const ctx: DraftContext = {
  clients: parseCtx.clients,
  items: [
    { id: 'daikin', clientId: 'ivan', name: 'Daikin', keys: 'daikin ftxm35' },
    { id: 'lg', clientId: 'maria', name: 'LG', keys: 'lg' },
  ],
  depositsOnNewJob: false,
}

const read = (text: string, fixes: DraftFixes = {}, context = ctx) =>
  readDraft(parseLine(text, parseCtx), fixes, context)

const save = (
  draft: ReturnType<typeof read>,
  flow: 'single' | 'multi' = 'multi',
  done = false,
) =>
  saveArgs(draft, {
    flow,
    received: { date: TODAY, method: 'cash' },
    depositLabel: 'Капаро',
    done,
  })

describe('readDraft: money received now', () => {
  it('a deposit is labelled, and never saves the job as Done', () => {
    const draft = read('Иван Петров, гардероб, 950, капаро 300, до 20.10')
    expect(draft.isPayment).toBe(false)
    expect(draft.receivedCents).toBe(30000)
    expect(draft.coversPrice).toBe(false)
    expect(save(draft)?.deposit).toEqual({
      amountCents: 30000,
      date: TODAY,
      method: 'cash',
      label: 'Капаро',
    })
  })

  it('"платено" with no amount is the whole price, a payment that covers it', () => {
    const draft = read('Без клиент, зареждане с фреон, 40, платено')
    expect(draft.isPayment).toBe(true)
    expect(draft.receivedCents).toBe(4000)
    expect(draft.coversPrice).toBe(true)
    expect(save(draft)?.deposit?.label).toBeUndefined()
  })

  it('the whole price follows a fixed price', () => {
    const line = 'Без клиент, зареждане с фреон, 40, платено'
    const fixes = read(line).fix.price('55')
    expect(read(line, fixes).receivedCents).toBe(5500)
  })

  it('a payment short of the price can’t save the job as Done', () => {
    expect(read('Иван Петров, гардероб, 950, платено 300').coversPrice).toBe(
      false,
    )
  })

  it('shows the received row when the business asks for deposits, even empty', () => {
    expect(read('Иван Петров, гардероб').showReceived).toBe(false)
    expect(
      read('Иван Петров, гардероб', {}, { ...ctx, depositsOnNewJob: true })
        .showReceived,
    ).toBe(true)
  })

  it('nothing received sends no deposit', () => {
    const draft = read('Иван Петров, гардероб, 950')
    const fixes = draft.fix.received('0')
    expect(save(read('Иван Петров, гардероб, 950', fixes))?.deposit).toBe(
      undefined,
    )
  })
})

describe('readDraft: fixes', () => {
  it('a fix holds while the line reads the field the same way', () => {
    const fixes = read('Иван Петров, гардероб, 950').fix.title(
      'Гардероб с огледало',
    )
    expect(read('Иван Петров, гардероб, 950, до 20.10', fixes).title).toBe(
      'Гардероб с огледало',
    )
  })

  it('a fix is dropped once the line reads that field differently', () => {
    const fixes = read('Иван Петров, гардероб, 950').fix.price('900')
    expect(read('Иван Петров, гардероб, 950', fixes).priceCents).toBe(90000)
    expect(read('Иван Петров, гардероб, 990', fixes).priceCents).toBe(99000)
  })

  it('the price input starts from the line, and the badge names a service price', () => {
    const draft = read('Мария Георгиева, профилактика')
    expect(draft.priceCents).toBe(5000)
    expect(draft.priceFromService).toBe(true)
    expect(draft.priceText).toBe('50')
    expect(
      read('Мария Георгиева, профилактика', draft.fix.price('60'))
        .priceFromService,
    ).toBe(false)
  })
})

describe('readDraft: client', () => {
  it('a client from the list carries its name and stored phone', () => {
    const draft = read('Иван Петров, гардероб')
    expect(draft.client).toEqual({
      kind: 'existing',
      id: 'ivan',
      name: 'Иван Петров',
    })
    expect(draft.clientSource).toBe('existing')
    expect(draft.phone).toBe('+359888123456')
  })

  it('a phone that is somebody else’s offers its owner, or the typed name as new', () => {
    const draft = read('Петър Колев, 0888 123 456, шкаф')
    expect(draft.alternatives.map((item) => [item.as, item.name])).toEqual([
      ['name', 'Иван Петров'],
      ['create', 'Петър Колев'],
    ])
  })

  it('a new name a typo from a client asks whether it is them', () => {
    const draft = read('Иван Птров, шкаф')
    expect(draft.client?.kind).toBe('new')
    expect(draft.alternatives.map((item) => item.as)).toEqual([
      'similar',
      'create',
    ])
  })

  it('opened from a client, the empty line already has it', () => {
    const start = { client: { id: 'maria', name: 'Мария Георгиева' } }
    const draft = read('', startFixes(start), { ...ctx, start })
    expect(draft.client).toMatchObject({ kind: 'existing', id: 'maria' })
    expect(draft.missing).toEqual({ client: false, title: true })
  })
})

describe('readDraft: items', () => {
  it('an item the line names is picked, and its word leaves the title', () => {
    const draft = read('Иван Петров, смяна на филтри Daikin')
    expect(draft.itemIds).toEqual(['daikin'])
    expect(draft.title).toBe('смяна на филтри')
  })

  it('unpicking the item puts its word back', () => {
    const line = 'Иван Петров, смяна на филтри Daikin'
    const fixes = read(line).fix.item('daikin')
    const draft = read(line, fixes)
    expect(draft.itemIds).toEqual([])
    expect(draft.title).toBe('смяна на филтри Daikin')
  })

  it('opened from an item, it stays linked until the client changes', () => {
    const start = {
      client: { id: 'maria', name: 'Мария Георгиева' },
      item: { id: 'lg', name: 'LG' },
    }
    const context = { ...ctx, start }
    const draft = read('профилактика', startFixes(start), context)
    expect(draft.linkedItem?.id).toBe('lg')
    expect(draft.itemIds).toEqual(['lg'])

    const other = draft.fix.client({
      kind: 'existing',
      id: 'ivan',
      name: 'Иван Петров',
    })
    const moved = read('профилактика', other, context)
    expect(moved.linkedItem).toBeUndefined()
    expect(moved.itemIds).toEqual([])
  })
})

describe('saveArgs', () => {
  it('is null while the client or the title is missing', () => {
    expect(save(read(''))).toBeNull()
    expect(save(read('Иван Петров'))).toBeNull()
  })

  it('one-visit work saves the date as an appointment, work in stages as a due date', () => {
    const draft = read('Иван Петров, гардероб, до 20.10')
    expect(save(draft, 'single')).toMatchObject({
      when: { date: '2026-10-20' },
      dueDate: undefined,
    })
    expect(save(draft, 'multi')).toMatchObject({
      when: undefined,
      dueDate: '2026-10-20',
    })
  })

  it('capitalizes the title and names the client the server way', () => {
    expect(save(read('Без клиент, зареждане с фреон'))).toMatchObject({
      client: { kind: 'none' },
      title: 'Зареждане с фреон',
    })
    expect(save(read('Иван Петров, гардероб'))?.client).toEqual({
      kind: 'existing',
      clientId: 'ivan',
    })
  })

  it('"save as Done" is passed on only when asked for', () => {
    const draft = read('Без клиент, зареждане с фреон, 40, платено')
    expect(save(draft)?.done).toBeUndefined()
    expect(save(draft, 'single', true)?.done).toBe(true)
  })
})
