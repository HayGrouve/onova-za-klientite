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
      <div id="card2" onPointerDown={(event) => press(event, 'job-2')} />
      <div id="zone" data-drop="zone:a" />
      <div id="column" data-drop="column:done" />
      {drag && (
        <div
          id="float"
          ref={floatRef}
          data-item={String(drag.item)}
          data-over={drag.over ?? ''}
          style={{ transform: `translate3d(${drag.left}px, ${drag.top}px, 0)` }}
        />
      )}
    </div>
  )
}

function pointer(type: string, init: { x: number; y: number }, pointerId = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: init.x,
    clientY: init.y,
  })
  Object.assign(event, { pointerId, pointerType: 'mouse' })
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

  it('a new press ends a drag in flight without dropping it, and takes over', () => {
    const card = container.querySelector('#card') as HTMLElement
    const other = container.querySelector('#card2') as HTMLElement
    const html = document.documentElement
    act(() => {
      card.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
      window.dispatchEvent(pointer('pointermove', { x: 30, y: 30 }))
    })
    expect(html.classList.contains('dragging-card')).toBe(true)

    // The first finger's release was lost; another press must not be locked out.
    under = container.querySelector('#zone')
    act(() => {
      other.dispatchEvent(pointer('pointerdown', { x: 200, y: 200 }, 2))
    })
    expect(onDrop).not.toHaveBeenCalled()
    expect(container.querySelector('#float')).toBeNull()
    act(() => {
      window.dispatchEvent(pointer('pointermove', { x: 230, y: 230 }, 2))
    })
    expect(
      (container.querySelector('#float') as HTMLElement).dataset.item,
    ).toBe('job-2')
    act(() => {
      window.dispatchEvent(pointer('pointerup', { x: 230, y: 230 }, 2))
    })
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith('job-2', 'zone:a')
    expect(html.classList.contains('dragging-card')).toBe(false)
  })

  it('a cancel from another pointer leaves the drag alone', () => {
    const card = container.querySelector('#card') as HTMLElement
    act(() => {
      card.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
      window.dispatchEvent(pointer('pointermove', { x: 30, y: 30 }))
      window.dispatchEvent(pointer('pointercancel', { x: 0, y: 0 }, 2))
    })
    expect(container.querySelector('#float')).not.toBeNull()
    act(() => {
      window.dispatchEvent(pointer('pointercancel', { x: 30, y: 30 }))
    })
    expect(container.querySelector('#float')).toBeNull()
  })

  it('ends a press its own pointer never released when it presses again', () => {
    const card = container.querySelector('#card') as HTMLElement
    const html = document.documentElement
    act(() => {
      card.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
      window.dispatchEvent(pointer('pointermove', { x: 30, y: 30 }))
      card.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
    })
    expect(container.querySelector('#float')).toBeNull()
    expect(html.classList.contains('dragging-card')).toBe(false)
  })
})
