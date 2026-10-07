import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import { CenteredMessage } from '#/components/centered-message'
import { Button } from '#/components/ui/button'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

/** Something went wrong: what, in plain words, and a way to try again. */
export function ErrorView({ error }: { error: unknown }) {
  return (
    <CenteredMessage>
      <h1 className="text-lg font-semibold">{m.error_title()}</h1>
      <p className="text-muted-foreground" role="alert">
        {errorMessage(error)}
      </p>
      <Button
        size="lg"
        className="h-12 rounded-xl px-5"
        onClick={() => window.location.reload()}
      >
        <ArrowClockwiseIcon aria-hidden />
        {m.error_retry()}
      </Button>
    </CenteredMessage>
  )
}
