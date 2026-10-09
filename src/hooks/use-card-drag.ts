import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * What the screen needs to know about a drag. It changes when a drag starts,
 * ends or moves onto another target, not with the pointer: the floating card
 * is moved through `floatRef`, so a pointer move renders nothing.
 */
export type CardDrag<T> = {
  item: T
  /** Where the floating card starts, and how wide it is. */
  left: number
  top: number
  width: number
  /** The drop target under the pointer: `column:<group>` or `zone:<stageId>`. */
  over: string | null
}

// How far a mouse moves before a press becomes a drag, and how long a finger
// holds still first, so a swipe still scrolls the page.
const DRAG_DISTANCE = 5
const TOUCH_HOLD_MS = 300
const EDGE = 64

/**
 * Dragging cards with pointer events, so it works the same with a mouse, a
 * pen or a finger, and in any browser. Drop targets are elements with a
 * `data-drop` key. Near the top or bottom of the window the page scrolls.
 *
 * Put `floatRef` on the element that follows the pointer. Its `transform` is
 * written here; render it at `drag.left`/`drag.top` (React leaves a style it
 * did not change alone, so the later writes stay).
 */
export function useCardDrag<T>(onDrop: (item: T, key: string) => void) {
  const [drag, setDrag] = useState<CardDrag<T> | null>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop
  const dragged = useRef(false)
  // How to end the gesture in flight, if any.
  const cleanupRef = useRef<{ end: () => void }>(undefined)
  useEffect(() => () => cleanupRef.current?.end(), [])

  const press = useCallback(
    (event: ReactPointerEvent<HTMLElement>, item: T) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('[data-no-drag]')) return
      // A new press ends any gesture still in flight, without dropping it: its
      // release may have been missed (the browser took the touch), and
      // waiting for it would lock every card out.
      cleanupRef.current?.end()
      const rect = event.currentTarget.getBoundingClientRect()
      const { pointerId } = event
      const start = { x: event.clientX, y: event.clientY }
      const offset = { x: start.x - rect.left, y: start.y - rect.top }
      const touch = event.pointerType === 'touch'
      let pointer = start
      let held = !touch
      let active = false
      let over: string | null = null
      let frame = 0

      const update = () => {
        const left = pointer.x - offset.x
        const top = pointer.y - offset.y
        const float = floatRef.current
        if (float) float.style.transform = `translate3d(${left}px, ${top}px, 0)`
        const target = document
          .elementFromPoint(pointer.x, pointer.y)
          ?.closest<HTMLElement>('[data-drop]')
        const next = target?.dataset.drop ?? null
        if (next === over) return
        over = next
        setDrag((current) => current && { ...current, over: next })
      }
      const scroll = () => {
        const step =
          pointer.y < EDGE
            ? -12
            : pointer.y > window.innerHeight - EDGE
              ? 12
              : 0
        if (step) {
          window.scrollBy(0, step)
          update()
        }
        frame = requestAnimationFrame(scroll)
      }
      const begin = () => {
        active = true
        document.body.style.userSelect = 'none'
        // The whole page shows the grabbing hand while a card is held.
        document.documentElement.classList.add('dragging-card')
        over =
          document
            .elementFromPoint(pointer.x, pointer.y)
            ?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
        setDrag({
          item,
          left: pointer.x - offset.x,
          top: pointer.y - offset.y,
          width: rect.width,
          over,
        })
        frame = requestAnimationFrame(scroll)
      }
      const hold = touch
        ? window.setTimeout(() => {
            held = true
            begin()
          }, TOUCH_HOLD_MS)
        : 0

      const onMove = (moved: PointerEvent) => {
        if (moved.pointerId !== pointerId) return
        pointer = { x: moved.clientX, y: moved.clientY }
        const distance = Math.hypot(pointer.x - start.x, pointer.y - start.y)
        if (!active) {
          // A finger that moves before the hold is scrolling, not dragging.
          if (!held) {
            if (distance > DRAG_DISTANCE * 2) end()
          } else if (distance > DRAG_DISTANCE) begin()
          return
        }
        update()
      }
      const onUp = (released: PointerEvent) => {
        if (released.pointerId !== pointerId) return
        if (active) {
          // The click that follows a drag must not open the job.
          dragged.current = true
          window.setTimeout(() => (dragged.current = false))
          if (over) dropRef.current(item, over)
        }
        end()
      }
      const onKey = (key: KeyboardEvent) => key.key === 'Escape' && end()
      // While dragging, a finger moves the card instead of the page.
      const onTouchMove = (moved: TouchEvent) =>
        active && moved.preventDefault()
      // A finger held on a card would also open the phone's long-press menu
      // (or iOS's link preview), which cancels the drag. A mouse's right
      // click keeps its menu.
      const onMenu = (opened: Event) => touch && opened.preventDefault()
      const onCancel = (cancelled: PointerEvent) =>
        cancelled.pointerId === pointerId && end()
      const end = () => {
        window.clearTimeout(hold)
        cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('contextmenu', onMenu)
        document.removeEventListener('touchmove', onTouchMove)
        document.body.style.userSelect = ''
        document.documentElement.classList.remove('dragging-card')
        active = false
        cleanupRef.current = undefined
        setDrag(null)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey)
      window.addEventListener('contextmenu', onMenu)
      document.addEventListener('touchmove', onTouchMove, { passive: false })
      cleanupRef.current = { end }
    },
    [],
  )

  const wasDragged = useCallback(() => dragged.current, [])

  return { drag, floatRef, press, wasDragged }
}
