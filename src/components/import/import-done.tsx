import { CheckCircleIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { Button, buttonVariants } from '#/components/ui/button'
import { clearOutcome } from '#/lib/import-outcome'
import type { ImportOutcome } from '#/lib/import-outcome'
import { m } from '#/paraglide/messages.js'

/**
 * How the import ended, and where to go next: the clients, another file, or
 * back to where the person came from (Settings → Data, else Today).
 */
export function ImportDone({
  outcome,
  clients,
  from,
  onAgain,
}: {
  outcome: ImportOutcome
  /** The business's word for clients, for the button that opens the list. */
  clients: string
  from?: 'settings'
  onAgain: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6 text-center lg:mx-auto lg:max-w-md">
      <CheckCircleIcon className="size-14 text-primary" weight="fill" />
      <h2 className="text-xl font-semibold">{m.import_done_title()}</h2>
      <p className="text-lg" data-testid="import-result">
        {m.import_result({
          created: outcome.created,
          skipped: outcome.skipped,
        })}
      </p>
      {outcome.failed && (
        <p role="alert" className="text-sm text-destructive">
          {m.import_failed()}
        </p>
      )}
      <div className="flex w-full flex-col gap-3">
        <Link
          to="/clients"
          onClick={clearOutcome}
          className={buttonVariants({ size: 'xl' })}
        >
          {m.import_see_clients({ clients })}
        </Link>
        <Button type="button" variant="outline" size="xl" onClick={onAgain}>
          {m.import_more()}
        </Button>
        <BackLink from={from} />
      </div>
    </div>
  )
}

/** The way back: to Settings → Data when the person came from there, else to Today. */
export function BackLink({ from }: { from?: 'settings' }) {
  return from === 'settings' ? (
    <Link
      to="/settings/data"
      onClick={clearOutcome}
      className={buttonVariants({ variant: 'ghost', size: 'xl' })}
    >
      {m.import_to_data()}
    </Link>
  ) : (
    <Link
      to="/"
      onClick={clearOutcome}
      className={buttonVariants({ variant: 'ghost', size: 'xl' })}
    >
      {m.import_go_today()}
    </Link>
  )
}
