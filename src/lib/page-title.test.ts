import { describe, expect, it } from 'vitest'
import { pageTitle } from './page-title'

describe('pageTitle', () => {
  it('puts the page first and the app after it, so the tab shows the page', () => {
    expect(pageTitle('Днес')).toBe('Днес · Онова за клиентите')
    expect(pageTitle('Гардероб за Иван')).toBe(
      'Гардероб за Иван · Онова за клиентите',
    )
  })

  it('is the app name alone when there is no page title', () => {
    expect(pageTitle(undefined)).toBe('Онова за клиентите')
    expect(pageTitle('')).toBe('Онова за клиентите')
    expect(pageTitle('   ')).toBe('Онова за клиентите')
  })

  it('trims the page title', () => {
    expect(pageTitle('  Клиенти ')).toBe('Клиенти · Онова за клиентите')
  })
})
