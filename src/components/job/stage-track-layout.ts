import type { StageGroup } from '../../../shared/stages'

/** A label's span along the track, in pixels from its left edge. */
export type LabelBox = { left: number; right: number }

/**
 * The stops on a job's track: the business's stages in order, without the
 * Cancelled group, which is a way off the track rather than a step on it.
 * `current` is the job's stop, or -1 for a cancelled job.
 */
export function trackStops<TStage extends { _id: string; group: StageGroup }>(
  stages: TStage[],
  currentId: string,
) {
  const stops = stages.filter((stage) => stage.group !== 'cancelled')
  return {
    stops,
    current: stops.findIndex((stage) => stage._id === currentId),
  }
}

/**
 * Where each of `count` stops sits on a track `width` pixels wide: evenly
 * from `inset` to `width - inset`, so the end dots stay inside it.
 */
export function stopCenters(count: number, width: number, inset: number) {
  if (count === 1) return [inset]
  return Array.from(
    { length: count },
    (_, index) => inset + (index / (count - 1)) * (width - 2 * inset),
  )
}

/**
 * Each stop's label, under its stop: the first starts at the track's left
 * edge, the last ends at its right edge, and the ones between are centred
 * under their stop, moved in only as far as it takes to stay on the track.
 */
export function labelBoxes(
  centers: number[],
  widths: number[],
  width: number,
): LabelBox[] {
  const last = centers.length - 1
  return centers.map((center, index) => {
    const size = widths[index]
    if (index === 0) return { left: 0, right: size }
    if (index === last) return { left: width - size, right: width }
    const left = Math.min(Math.max(center - size / 2, 0), width - size)
    return { left, right: left + size }
  })
}

const apart = (a: LabelBox, b: LabelBox, gap: number) =>
  a.right + gap <= b.left || b.right + gap <= a.left

/**
 * Which labels to show. Every one when no two come closer than `gap`;
 * otherwise the current stop's, then the first's and the last's, each only
 * if it clears the ones already shown. Every stop keeps its dot either way.
 */
export function visibleLabels(
  boxes: LabelBox[],
  current: number,
  gap: number,
): boolean[] {
  const fits = boxes.every(
    (box, index) => index === 0 || boxes[index - 1].right + gap <= box.left,
  )
  if (fits) return boxes.map(() => true)
  const shown = boxes.map(() => false)
  for (const index of [current, 0, boxes.length - 1]) {
    if (index < 0 || shown[index]) continue
    const clear = boxes.every(
      (box, other) => !shown[other] || apart(box, boxes[index], gap),
    )
    if (clear) shown[index] = true
  }
  return shown
}
