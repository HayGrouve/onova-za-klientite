import { describe, expect, it } from 'vitest'
import { PHONE_QUERY, TOAST_MOBILE_OFFSET, TOAST_OFFSET } from './toast-layout'

describe('toast layout', () => {
  it('treats everything below lg as a phone, as the header and bottom nav do', () => {
    expect(PHONE_QUERY).toBe('(max-width: 63.999rem)')
  })

  it("puts a top toast under the header from sonner's 601 px up, where its mobile offset ends", () => {
    // 4rem: the header's 0.75rem top padding, 2.75rem buttons and 0.5rem bottom.
    expect(TOAST_OFFSET.top).toBe('calc(4rem + env(safe-area-inset-top))')
    expect(TOAST_OFFSET.top).not.toBe(16)
  })

  it('keeps the phone offsets the bottom nav slot and the top edge', () => {
    expect(TOAST_OFFSET.bottom).toBe('var(--toast-bottom)')
    expect(TOAST_MOBILE_OFFSET).toEqual({
      bottom: 'var(--toast-bottom)',
      top: 'calc(0.75rem + env(safe-area-inset-top))',
    })
  })
})
