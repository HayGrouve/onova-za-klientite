// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isShortcut, shortcutBlockedAt } from './shortcuts'

afterEach(() => {
  document.body.innerHTML = ''
})

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('isShortcut', () => {
  it('a plain letter matches', () => {
    expect(isShortcut(press({ key: 'n', code: 'KeyN' }), 'n')).toBe(true)
    expect(isShortcut(press({ key: 'N', code: 'KeyN' }), 'n')).toBe(true)
    expect(isShortcut(press({ key: 'm', code: 'KeyM' }), 'n')).toBe(false)
  })

  it('the same key on a Bulgarian layout matches by its position', () => {
    expect(isShortcut(press({ key: 'н', code: 'KeyN' }), 'n')).toBe(true)
    expect(
      isShortcut(press({ key: 'к', code: 'KeyK', ctrlKey: true }), 'k', true),
    ).toBe(true)
  })

  it('a plain shortcut gives way to Ctrl, Alt and Cmd, which belong to the browser', () => {
    expect(isShortcut(press({ key: 'n', ctrlKey: true }), 'n')).toBe(false)
    expect(isShortcut(press({ key: 'n', altKey: true }), 'n')).toBe(false)
    expect(isShortcut(press({ key: 'n', metaKey: true }), 'n')).toBe(false)
  })

  it('a Ctrl shortcut needs Ctrl or Cmd, and no Alt', () => {
    expect(isShortcut(press({ key: 'k', ctrlKey: true }), 'k', true)).toBe(true)
    expect(isShortcut(press({ key: 'k', metaKey: true }), 'k', true)).toBe(true)
    expect(isShortcut(press({ key: 'k' }), 'k', true)).toBe(false)
    expect(
      isShortcut(press({ key: 'k', ctrlKey: true, altKey: true }), 'k', true),
    ).toBe(false)
  })

  it('a held key and a key that was handled already do not count', () => {
    expect(isShortcut(press({ key: 'n', repeat: true }), 'n')).toBe(false)
    const handled = press({ key: 'n', cancelable: true })
    handled.preventDefault()
    expect(isShortcut(handled, 'n')).toBe(false)
  })
})

describe('shortcutBlockedAt', () => {
  const at = (html: string, selector: string) => {
    document.body.innerHTML = html
    return document.querySelector(selector)
  }

  it('is blocked where a person types', () => {
    expect(shortcutBlockedAt(at('<input id="x">', '#x'))).toBe(true)
    expect(shortcutBlockedAt(at('<textarea id="x"></textarea>', '#x'))).toBe(
      true,
    )
    expect(
      shortcutBlockedAt(at('<select id="x"><option>a</option></select>', '#x')),
    ).toBe(true)
    expect(
      shortcutBlockedAt(at('<div id="x" contenteditable="true"></div>', '#x')),
    ).toBe(true)
    expect(
      shortcutBlockedAt(
        at('<div contenteditable><span id="x">a</span></div>', '#x'),
      ),
    ).toBe(true)
  })

  it('is blocked inside an open dialog or menu', () => {
    expect(
      shortcutBlockedAt(
        at('<div role="dialog"><button id="x">ok</button></div>', '#x'),
      ),
    ).toBe(true)
    expect(
      shortcutBlockedAt(
        at('<div role="menu"><div role="menuitem" id="x">a</div></div>', '#x'),
      ),
    ).toBe(true)
  })

  it('is free on the page, a button or a link', () => {
    expect(shortcutBlockedAt(at('<button id="x">ok</button>', '#x'))).toBe(
      false,
    )
    expect(shortcutBlockedAt(at('<a id="x" href="/">ok</a>', '#x'))).toBe(false)
    expect(
      shortcutBlockedAt(at('<div contenteditable="false" id="x"></div>', '#x')),
    ).toBe(false)
    expect(shortcutBlockedAt(document.body)).toBe(false)
    expect(shortcutBlockedAt(null)).toBe(false)
  })
})
