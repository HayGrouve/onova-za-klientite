// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCardDrag } from './use-card-drag'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let renders = 0
let onDrop = vi.fn()

function Harness() {
  const { drag, floatRef, press } = useCardDrag<string>(onDrop)
  renders += 1
  return (
    <div>
      <div
        id="card"
        onPointerDown={(event) => press(event, 'job-1')}
        data-testid="card"
      />
      <div id="zone" data-drop="zone:a" />
      <div id="column" data-drop="column:done" />
      {drag && (
        <div
          id="float"
          ref={floatRef}
          data-over={drag.over ?? ''}
          style={{ transform: `translate3d(${drag.left}px, ${drag.top}px, 0)` }}
        />
      )}
    </div>
  )
}

function pointer(type: string, init: { x: number; y: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: init.x,
    clientY: init.y,
  })
  Object.assign(event, { pointerId: 1, pointerType: 'mouse' })
  return event
}

describe('useCardDrag', () => {
  let root: Root
  let container: HTMLDivElement
  let under: Element | null = null

  beforeEach(() => {
    renders = 0
    onDrop = vi.fn()
    under = null
    document.elementFromPoint = () => under
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<Harness />))
    renders = 0
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('moves the floating card without rendering, and renders on a new target', () => {
    const card = container.querySelector('#card') as HTMLElement
    act(() => {
      card.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
    })
    act(() => {
      window.dispatchEvent(pointer('pointermove', { x: 30, y: 30 }))
    })
    const float = container.querySelector('#float') as HTMLElement
    expect(float).not.toBeNull()
    const afterStart = renders

    // Many moves over nothing: the card follows, React renders nothing.
    for (let step = 0; step < 20; step++) {
      act(() => {
        window.dispatchEvent(pointer('pointermove', { x: 40 + step, y: 50 }))
      })
    }
    expect(renders).toBe(afterStart)
    expect(float.style.transform).toBe('translate3d(49px, 40px, 0)')

    // Entering a drop target is the one thing that renders.
    under = container.querySelector('#zone')
    act(() => {
      window.dispatchEvent(pointer('pointermove', { x: 70, y: 50 }))
    })
    expect(renders).toBe(afterStart + 1)
    expect(float.dataset.over).toBe('zone:a')
    act(() => {
      window.dispatchEvent(pointer('pointermove', { x: 71, y: 50 }))
    })
    expect(renders).toBe(afterStart + 1)
    // A render for the new target leaves the position that was written.
    expect(float.style.transform).toBe('translate3d(61px, 40px, 0)')

    act(() => {
      window.dispatchEvent(pointer('pointerup', { x: 71, y: 50 }))
    })
    expect(onDrop).toHaveBeenCalledWith('job-1', 'zone:a')
    expect(container.querySelector('#float')).toBeNull()
  })

  it('does not drop on Escape or without a target', () => {
    const card = container.querySelector('#card') as HTMLElement
    act(() => {
      card.dispatchEvent(pointer('pointerdown', { x: 0, y: 0 }))
      window.dispatchEvent(pointer('pointermove', { x: 20, y: 0 }))
    })
    under = container.querySelector('#column')
    act(() => {
      window.dispatchEvent(pointer('pointermove', { x: 25, y: 0 }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    act(() => {
      window.dispatchEvent(pointer('pointerup', { x: 25, y: 0 }))
    })
    expect(onDrop).not.toHaveBeenCalled()
    expect(container.querySelector('#float')).toBeNull()
  })

  it('a click that never moves is not a drag', () => {
    const card = container.querySelector('#card') as HTMLElement
    act(() => {
      card.dispatchEvent(pointer('pointerdown', { x: 5, y: 5 }))
      window.dispatchEvent(pointer('pointerup', { x: 5, y: 5 }))
    })
    expect(onDrop).not.toHaveBeenCalled()
    expect(container.querySelector('#float')).toBeNull()
  })
})
