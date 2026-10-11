import { cn } from 'cn'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { m } from '#/paraglide/messages.js'
import {
  labelBoxes,
  stopCenters,
  trackStops,
  visibleLabels,
} from '#/components/job/stage-track-layout'
import type { LabelBox } from '#/components/job/stage-track-layout'
import type { StageGroup } from '../../../shared/stages'

/** Half the current stop's marker: the end stops sit this far in from the edges. */
const INSET = 9
/** The least space between two labels that are both shown. */
const GAP = 10

type Layout = { boxes: LabelBox[]; shown: boolean[] }

const sameLayout = (a: Layout | null, b: Layout) =>
  a !== null &&
  a.shown.length === b.shown.length &&
  a.shown.every((shown, index) => shown === b.shown[index]) &&
  a.boxes.every(
    (box, index) =>
      box.left === b.boxes[index].left && box.right === b.boxes[index].right,
  )

/**
 * Where the job is among the business's stages (D116): a rail of stops in
 * order, travelled up to the current one, which is larger. Each label sits
 * under its stop; when they would run into each other only the current,
 * first and last ones show, measured rather than guessed, and every stop
 * keeps its dot. When the job moves, the fill and the marker slide to the new
 * stop. Cancelled stages are not stops: a cancelled job's track is greyed.
 */
export function StageTrack({
  stages,
  currentId,
}: {
  stages: Array<{ _id: string; name: string; group: StageGroup }>
  currentId: string
}) {
  const { stops, current } = trackStops(stages, currentId)
  const list = useRef<HTMLOListElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const count = stops.length
  const share = count > 1 && current > 0 ? current / (count - 1) : 0
  const at = (index: number) =>
    `${count > 1 ? (index / (count - 1)) * 100 : 0}%`

  const measure = useCallback(() => {
    const element = list.current
    if (!element) return
    const labels = Array.from(element.children) as HTMLElement[]
    const width = element.clientWidth
    const boxes = labelBoxes(
      stopCenters(labels.length, width, INSET),
      labels.map((label) => label.offsetWidth),
      width,
    )
    const next = { boxes, shown: visibleLabels(boxes, current, GAP) }
    setLayout((previous) => (sameLayout(previous, next) ? previous : next))
  }, [current])

  // Measured before the first paint, and again whenever the track or a label
  // changes size: the font arriving, the current label turning bold, a turn
  // of the phone.
  const names = stops.map((stop) => stop.name).join('\n')
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const label of Array.from(element.children)) observer.observe(label)
    return () => observer.disconnect()
  }, [measure, names])

  return (
    <div className={cn('flex flex-col gap-2', current < 0 && 'opacity-70')}>
      <div aria-hidden className="relative h-5" style={{ marginInline: INSET }}>
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
        <div
          className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full bg-ring transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${share * 100}%` }}
        />
        {stops.map((stop, index) => (
          <span
            key={stop._id}
            className={cn(
              'absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 transition-colors duration-300 motion-reduce:transition-none',
              index < current ? 'border-ring bg-ring' : 'border-input bg-card',
            )}
            style={{ left: at(index) }}
          />
        ))}
        {current >= 0 && (
          <span
            className="absolute top-1/2 size-4.5 -translate-1/2 rounded-full bg-primary ring-4 ring-accent transition-[left] duration-300 ease-out motion-reduce:transition-none"
            style={{ left: at(current) }}
          />
        )}
      </div>
      <ol
        ref={list}
        aria-label={m.job_stage()}
        className="relative h-5 text-sm"
      >
        {stops.map((stop, index) => (
          <li
            key={stop._id}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'absolute top-0 max-w-full truncate leading-5 whitespace-nowrap transition-opacity duration-300 motion-reduce:transition-none',
              index === current
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
              // Hidden labels stay in the list, so a screen reader reads every stage.
              layout && !layout.shown[index] && 'opacity-0',
            )}
            style={{ left: layout?.boxes[index]?.left ?? 0 }}
          >
            {stop.name}
          </li>
        ))}
      </ol>
    </div>
  )
}
