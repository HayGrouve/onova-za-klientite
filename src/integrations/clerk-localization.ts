import { bgBG } from '@clerk/localizations/bg-BG'
import { m } from '#/paraglide/messages.js'

/** Clerk's community Bulgarian (ADR 0003), with local fills for its gaps. */
export const clerkLocalization = {
  ...bgBG,
  signIn: {
    ...bgBG.signIn,
    start: {
      ...bgBG.signIn?.start,
      title: m.clerk_sign_in_title(),
      titleCombined: m.clerk_sign_in_title(),
      subtitle: m.clerk_sign_in_subtitle(),
      subtitleCombined: m.clerk_sign_in_subtitle(),
    },
    emailCode: {
      ...bgBG.signIn?.emailCode,
      subtitle: m.clerk_email_code_subtitle(),
    },
  },
  formFieldInputPlaceholder__emailAddress: m.clerk_email_placeholder(),
  formFieldLabel__emailAddress: m.clerk_email_label(),
}
