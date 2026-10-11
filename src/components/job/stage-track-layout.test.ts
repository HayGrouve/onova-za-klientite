import { describe, expect, it } from 'vitest'
import {
  labelBoxes,
  stopCenters,
  trackStops,
  visibleLabels,
} from './stage-track-layout'

const stage = (
  id: string,
  group: 'new' | 'in_progress' | 'done' | 'cancelled',
) => ({ _id: id, group }) as const

const stages = [
  stage('a', 'new'),
  stage('b', 'in_progress'),
  stage('x', 'cancelled'),
  stage('c', 'in_progress'),
  stage('d', 'done'),
]

describe('trackStops', () => {
  it('leaves Cancelled-group stages off the track, in order', () => {
    expect(trackStops(stages, 'c').stops.map((s) => s._id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('finds the current stop among the stops, not the stages', () => {
    expect(trackStops(stages, 'c').current).toBe(2)
    expect(trackStops(stages, 'a').current).toBe(0)
    expect(trackStops(stages, 'd').current).toBe(3)
  })

  it('has no current stop for a cancelled job, or a stage it does not know', () => {
    expect(trackStops(stages, 'x').current).toBe(-1)
    expect(trackStops(stages, 'gone').current).toBe(-1)
  })
})

describe('stopCenters', () => {
  it('spreads the stops from one inset edge to the other', () => {
    expect(stopCenters(4, 316, 8)).toEqual([8, 108, 208, 308])
  })

  it('puts a single stop at the start', () => {
    expect(stopCenters(1, 300, 8)).toEqual([8])
  })

  it('has no stops for no stages', () => {
    expect(stopCenters(0, 300, 8)).toEqual([])
  })
})

describe('labelBoxes', () => {
  it('starts the first label at the left edge and ends the last at the right', () => {
    const boxes = labelBoxes([8, 158, 308], [40, 60, 50], 316)
    expect(boxes[0]).toEqual({ left: 0, right: 40 })
    expect(boxes[2]).toEqual({ left: 266, right: 316 })
  })

  it('centres a middle label under its stop', () => {
    expect(labelBoxes([8, 158, 308], [40, 60, 50], 316)[1]).toEqual({
      left: 128,
      right: 188,
    })
  })

  it('keeps a wide middle label inside the track', () => {
    const boxes = labelBoxes([8, 40, 308], [20, 120, 20], 316)
    expect(boxes[1]).toEqual({ left: 0, right: 120 })
    const right = labelBoxes([8, 290, 308], [20, 120, 20], 316)
    expect(right[1]).toEqual({ left: 196, right: 316 })
  })

  it('starts a lone label at the left edge', () => {
    expect(labelBoxes([8], [70], 316)).toEqual([{ left: 0, right: 70 }])
  })
})

describe('visibleLabels', () => {
  const box = (left: number, right: number) => ({ left, right })

  it('shows every label when none would touch', () => {
    const boxes = [box(0, 40), box(100, 160), box(260, 316)]
    expect(visibleLabels(boxes, 1, 8)).toEqual([true, true, true])
  })

  it('counts labels closer than the gap as touching', () => {
    const boxes = [box(0, 40), box(44, 100), box(260, 316)]
    expect(visibleLabels(boxes, 2, 8)).toEqual([true, false, true])
  })

  it('falls back to the current, first and last labels when two collide', () => {
    // Seven stops at 390 px: the middle ones run into each other.
    const boxes = [
      box(0, 45),
      box(30, 100),
      box(85, 150),
      box(140, 200),
      box(190, 250),
      box(240, 300),
      box(280, 358),
    ]
    expect(visibleLabels(boxes, 3, 8)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
    ])
  })

  it('prefers the current label over the first or last it would hit', () => {
    const boxes = [box(0, 45), box(30, 100), box(85, 150), box(140, 200)]
    expect(visibleLabels(boxes, 1, 8)).toEqual([false, true, false, true])
    expect(visibleLabels(boxes, 3, 8)).toEqual([true, false, false, true])
  })

  it('shows the first and last only on a cancelled job', () => {
    const boxes = [box(0, 45), box(30, 100), box(85, 150), box(140, 200)]
    expect(visibleLabels(boxes, -1, 8)).toEqual([true, false, false, true])
  })

  it('keeps the first label when the last would hit it', () => {
    const boxes = [box(0, 60), box(50, 110)]
    expect(visibleLabels(boxes, -1, 8)).toEqual([true, false])
  })
})
