import { describe, expect, it } from 'vitest'
import { offersRuleReminder } from './reminder-rule'

const reached = {
  from: 'in_progress',
  to: 'done',
  remindersOn: true,
  ruleOn: true,
  isNoClient: false,
} as const

describe('offersRuleReminder', () => {
  it('is offered when a job reaches Done and the rule is on', () => {
    expect(offersRuleReminder(reached)).toBe(true)
    expect(offersRuleReminder({ ...reached, from: 'new' })).toBe(true)
    expect(offersRuleReminder({ ...reached, from: 'cancelled' })).toBe(true)
  })

  it('is not offered for a job of the built-in No client', () => {
    expect(offersRuleReminder({ ...reached, isNoClient: true })).toBe(false)
  })

  it('is only offered on reaching Done, not on moving within it', () => {
    expect(offersRuleReminder({ ...reached, from: 'done' })).toBe(false)
    expect(offersRuleReminder({ ...reached, to: 'in_progress' })).toBe(false)
    expect(offersRuleReminder({ ...reached, to: 'cancelled' })).toBe(false)
  })

  it('is not offered with the Reminders module or the rule switched off', () => {
    expect(offersRuleReminder({ ...reached, remindersOn: false })).toBe(false)
    expect(offersRuleReminder({ ...reached, ruleOn: false })).toBe(false)
  })
})
