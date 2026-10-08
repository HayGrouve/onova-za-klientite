// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFixer } from './use-fixer'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let fixer: ReturnType<typeof useFixer>

function Harness() {
  fixer = useFixer()
  return null
}

let root: Root
let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<Harness />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('useFixer', () => {
  it('opens the box on a failed save and closes it once the line reads a title', () => {
    act(() => fixer.openAfterError())
    expect(fixer.fixing).toBe('title')
    expect(fixer.titleOpenedByError).toBe(true)
    act(() => fixer.closeIfOpenedByError())
    expect(fixer.fixing).toBeNull()
  })

  it('keeps a box that was opened by hand', () => {
    act(() => fixer.open('title'))
    expect(fixer.titleOpenedByError).toBe(false)
    act(() => fixer.closeIfOpenedByError())
    expect(fixer.fixing).toBe('title')
  })

  it('forgets the error once the user closes the box by hand', () => {
    act(() => fixer.openAfterError())
    act(() => fixer.close())
    expect(fixer.titleOpenedByError).toBe(false)
    // Tapping Fix on the title now opens it and keeps it open.
    act(() => fixer.open('title'))
    act(() => fixer.closeIfOpenedByError())
    expect(fixer.fixing).toBe('title')
  })

  it('forgets the error when another field takes the fixer', () => {
    act(() => fixer.openAfterError())
    act(() => fixer.open('price'))
    expect(fixer.titleOpenedByError).toBe(false)
    act(() => fixer.open('title'))
    act(() => fixer.closeIfOpenedByError())
    expect(fixer.fixing).toBe('title')
  })

  it('opens the box by hand even when an earlier error left it open', () => {
    act(() => fixer.openAfterError())
    act(() => fixer.open('title'))
    expect(fixer.titleOpenedByError).toBe(false)
    act(() => fixer.closeIfOpenedByError())
    expect(fixer.fixing).toBe('title')
  })
})
