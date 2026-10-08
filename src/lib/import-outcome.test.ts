import { describe, expect, it } from 'vitest'
import { OUTCOME_FRESH_MS, parseOutcome } from './import-outcome'
import type { ImportOutcome } from './import-outcome'

const NOW = 1_800_000_000_000
const outcome: ImportOutcome = {
  businessId: 'b1',
  created: 55,
  skipped: 2,
  failed: false,
  at: NOW - 5_000,
}

describe('parseOutcome', () => {
  it('reads back a fresh result of this business', () => {
    expect(parseOutcome(JSON.stringify(outcome), NOW, 'b1')).toEqual(outcome)
  })

  it('forgets a result once it is old, so a later visit starts clean', () => {
    const old = { ...outcome, at: NOW - OUTCOME_FRESH_MS - 1 }
    expect(parseOutcome(JSON.stringify(old), NOW, 'b1')).toBeNull()
  })

  it("never shows another business's result", () => {
    expect(parseOutcome(JSON.stringify(outcome), NOW, 'b2')).toBeNull()
  })

  it('ignores anything that is not a result', () => {
    expect(parseOutcome(null, NOW, 'b1')).toBeNull()
    expect(parseOutcome('', NOW, 'b1')).toBeNull()
    expect(parseOutcome('not json', NOW, 'b1')).toBeNull()
    expect(parseOutcome('{"created":"many"}', NOW, 'b1')).toBeNull()
    expect(parseOutcome('[]', NOW, 'b1')).toBeNull()
  })
})
