// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { toastError } from './toast-error'
import { PHONE_QUERY } from './toast-layout'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function phone(matches: boolean) {
  window.matchMedia = vi.fn(() => ({ matches })) as never
}

afterEach(() => vi.clearAllMocks())

describe('toastError', () => {
  it("goes to the top on a phone, clear of a sheet's Save button", () => {
    phone(true)
    toastError('Something went wrong')
    expect(window.matchMedia).toHaveBeenCalledWith(PHONE_QUERY)
    expect(toast.error).toHaveBeenCalledWith('Something went wrong', {
      position: 'top-center',
    })
  })

  it('stays with the other toasts on a wide screen', () => {
    phone(false)
    toastError('Something went wrong')
    expect(toast.error).toHaveBeenCalledWith('Something went wrong', undefined)
  })
})
