// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyTimingFlag,
  clearTimings,
  formatDuration,
  isTimingOn,
  readTimings,
  recordTiming,
} from './timing'

beforeEach(() => {
  localStorage.clear()
})

describe('timing flag (Q15)', () => {
  it('?timing turns it on for this device, ?timing=off hides it again', () => {
    expect(isTimingOn()).toBe(false)
    applyTimingFlag('?timing')
    expect(isTimingOn()).toBe(true)
    applyTimingFlag('?other=1')
    expect(isTimingOn()).toBe(true)
    applyTimingFlag('?timing=off')
    expect(isTimingOn()).toBe(false)
  })

  it('records times only while on, newest first', () => {
    recordTiming('setup', 1000)
    expect(readTimings()).toEqual([])
    applyTimingFlag('?timing')
    recordTiming('setup', 95_000, 1)
    recordTiming('newJob', 21_000, 2)
    expect(readTimings().map((record) => record.flow)).toEqual([
      'newJob',
      'setup',
    ])
    clearTimings()
    expect(readTimings()).toEqual([])
  })

  it('formats durations as minutes and seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(400)).toBe('0:00')
  })
})
