import { bgBG } from '@clerk/localizations/bg-BG'
import { describe, expect, it } from 'vitest'
import {
  trimClerkLocalization,
  UNUSED_CLERK_SECTIONS,
} from './clerk-localization.ts'

describe('trimClerkLocalization', () => {
  const trimmed = trimClerkLocalization(bgBG) as typeof bgBG

  it('keeps everything the sign-in card shows', () => {
    expect(trimmed.signIn?.start).toEqual(
      JSON.parse(JSON.stringify(bgBG.signIn?.start)),
    )
    expect(trimmed.signIn?.emailCode).toBeDefined()
    expect(trimmed.signUp).toBeDefined()
    expect(trimmed.unstable__errors).toEqual(
      JSON.parse(JSON.stringify(bgBG.unstable__errors)),
    )
    expect(trimmed.socialButtonsBlockButton).toBe(bgBG.socialButtonsBlockButton)
    expect(trimmed.formFieldLabel__emailAddress).toBe(
      bgBG.formFieldLabel__emailAddress,
    )
  })

  it('drops the sections of screens the app does not render', () => {
    for (const section of UNUSED_CLERK_SECTIONS) {
      expect(bgBG).toHaveProperty(section)
      expect(trimmed).not.toHaveProperty(section)
    }
  })

  it('never invents or changes a string', () => {
    const walk = (a: unknown, b: unknown) => {
      if (typeof b === 'object' && b !== null) {
        for (const [key, value] of Object.entries(b)) {
          walk((a as Record<string, unknown>)[key], value)
        }
      } else {
        expect(a).toBe(b)
      }
    }
    walk(bgBG, trimmed)
  })
})
