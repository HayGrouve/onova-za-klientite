// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTheme, saveTheme, subscribeTheme } from '#/lib/theme'

afterEach(() => localStorage.clear())

describe('theme choice', () => {
  it('follows the system until a choice is saved', () => {
    expect(readTheme()).toBe('system')
  })

  it('reads back the saved choice', () => {
    saveTheme('dark')
    expect(readTheme()).toBe('dark')
    saveTheme('light')
    expect(readTheme()).toBe('light')
  })

  it('forgets the choice when the system is chosen again', () => {
    saveTheme('dark')
    saveTheme('system')
    expect(readTheme()).toBe('system')
    expect(localStorage.length).toBe(0)
  })

  it('treats an unknown stored value as the system', () => {
    localStorage.setItem('onova.theme', 'sepia')
    expect(readTheme()).toBe('system')
  })

  it('tells subscribers when the choice changes', () => {
    const listener = vi.fn()
    const stop = subscribeTheme(listener)
    saveTheme('dark')
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    saveTheme('light')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
