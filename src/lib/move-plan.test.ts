import { describe, expect, it } from 'vitest'
import { planMove, targetGroup } from './move-plan'

const open = { stageId: 's1', stageGroup: 'in_progress' as const }
const done = { stageId: 's3', stageGroup: 'done' as const }
const cancelled = { stageId: 's4', stageGroup: 'cancelled' as const }
const stage = (_id: string, group: 'new' | 'done' | 'cancelled') => ({
  _id,
  group,
})

describe('targetGroup', () => {
  it('reads a stage group, and Cancelled for the bare target', () => {
    expect(targetGroup(stage('s3', 'done'))).toBe('done')
    expect(targetGroup('cancelled')).toBe('cancelled')
  })
})

describe('planMove', () => {
  it('skips a job that is gone', () => {
    expect(planMove(undefined, stage('s3', 'done'))).toBe('skip')
    expect(planMove(undefined, 'cancelled')).toBe('skip')
  })

  it('skips a move to the stage the job is already in', () => {
    expect(planMove(open, stage('s1', 'new'))).toBe('skip')
    expect(planMove(cancelled, stage('s4', 'cancelled'))).toBe('skip')
  })

  it('asks before a job leaves for Cancelled', () => {
    expect(planMove(open, stage('s4', 'cancelled'))).toBe('ask')
    expect(planMove(done, stage('s4', 'cancelled'))).toBe('ask')
    expect(planMove(open, 'cancelled')).toBe('ask')
  })

  it('does not ask again once the job is already cancelled', () => {
    // The answer comes after the job moved on another device: no second move.
    expect(planMove(cancelled, stage('s5', 'cancelled'))).toBe('move')
    expect(planMove(cancelled, 'cancelled')).toBe('move')
  })

  it('moves at once everywhere else', () => {
    expect(planMove(open, stage('s3', 'done'))).toBe('move')
    expect(planMove(cancelled, stage('s2', 'new'))).toBe('move')
  })
})
