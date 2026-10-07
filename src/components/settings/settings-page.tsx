import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { m } from '#/paraglide/messages.js'

/** A Settings section: a way back, a title, an optional line of help, the content. */
export function SettingsPage({
  title,
  help,
  children,
}: {
  title: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-1 px-4 pt-1">
        <Link
          to="/settings"
          className="-ml-1 flex min-h-11 w-fit items-center gap-1 rounded-xl text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CaretLeftIcon className="size-4" />
          {m.settings_back()}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {help && <p className="text-sm text-muted-foreground">{help}</p>}
      </div>
      {children}
    </div>
  )
}
