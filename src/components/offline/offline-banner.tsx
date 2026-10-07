import { WifiSlashIcon } from '@phosphor-icons/react'
import { m } from '#/paraglide/messages.js'

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <WifiSlashIcon className="size-5 shrink-0" />
      {m.offline_edit_blocked()}
    </div>
  )
}
