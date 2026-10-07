import { describe, expect, it } from 'vitest'
import { matchItem } from './line-items'
import type { ItemCandidate } from './line-items'

const daikin: ItemCandidate = {
  id: 'daikin',
  name: 'Daikin',
  keys: 'daikin ftxm35',
}
const mitsubishi: ItemCandidate = {
  id: 'mitsubishi',
  name: 'Mitsubishi',
  keys: 'mitsubishi',
}
const items = [daikin, mitsubishi]

describe('matchItem', () => {
  it('picks the item a word of the title names, and takes the word out', () => {
    expect(matchItem('смяна на филтри Daikin', items)).toEqual({
      id: 'daikin',
      title: 'смяна на филтри',
    })
  })

  it('reads the item typed in Cyrillic or Latin, any case', () => {
    expect(matchItem('смяна на филтри дайкин', items)?.id).toBe('daikin')
    expect(matchItem('филтри на DAIKIN', items)?.id).toBe('daikin')
    expect(matchItem('филтри Митсубиши', items)?.id).toBe('mitsubishi')
  })

  it('finds an item by a searchable extra value such as a model', () => {
    expect(matchItem('смяна на филтри FTXM35', items)).toEqual({
      id: 'daikin',
      title: 'смяна на филтри',
    })
  })

  it('takes out a run of words that all name the item', () => {
    expect(matchItem('смяна на филтри Daikin FTXM35', items)).toEqual({
      id: 'daikin',
      title: 'смяна на филтри',
    })
  })

  it('drops the preposition left dangling', () => {
    expect(matchItem('ремонт на Daikin', items)?.title).toBe('ремонт')
    expect(matchItem('смяна на филтри за Daikin', items)?.title).toBe(
      'смяна на филтри',
    )
  })

  it('links the item but leaves the title alone when taking the word out is not clearly right', () => {
    // In the middle of the title.
    expect(matchItem('смяна на Daikin филтри', items)).toEqual({
      id: 'daikin',
      title: 'смяна на Daikin филтри',
    })
    // At the front.
    expect(matchItem('Daikin филтри', items)?.title).toBe('Daikin филтри')
    // Nothing would be left.
    expect(matchItem('Daikin', items)).toEqual({
      id: 'daikin',
      title: 'Daikin',
    })
    expect(matchItem('на Daikin', items)?.title).toBe('на Daikin')
  })

  it('keeps the written case and punctuation of what stays', () => {
    expect(matchItem('Смяна на филтри Daikin.', items)?.title).toBe(
      'Смяна на филтри',
    )
  })

  it('picks nothing when no word names an item', () => {
    expect(matchItem('смяна на филтри', items)).toBeNull()
    expect(matchItem('', items)).toBeNull()
    expect(matchItem('смяна на филтри Daikin', [])).toBeNull()
  })

  it('is not fooled by short words', () => {
    const short: ItemCandidate = { id: 'x', name: 'На', keys: 'na' }
    expect(matchItem('ремонт на стол', [short])).toBeNull()
  })

  it('picks nothing when two items fit equally well', () => {
    const second: ItemCandidate = {
      id: 'daikin2',
      name: 'Daikin',
      keys: 'daikin ftxm50',
    }
    expect(matchItem('смяна на филтри Daikin', [daikin, second])).toBeNull()
  })

  it('picks the item more of the title names', () => {
    const second: ItemCandidate = {
      id: 'daikin2',
      name: 'Daikin',
      keys: 'daikin ftxm50',
    }
    expect(
      matchItem('смяна на филтри Daikin FTXM35', [second, daikin])?.id,
    ).toBe('daikin')
  })

  it('finds a plate whatever the spacing and the letters', () => {
    const car: ItemCandidate = {
      id: 'car',
      name: 'Opel Astra',
      keys: 'opel astra ca1234bp',
    }
    expect(matchItem('смяна на масло СА1234ВР', [car])).toEqual({
      id: 'car',
      title: 'смяна на масло',
    })
  })
})
