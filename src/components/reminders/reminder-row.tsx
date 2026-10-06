import { BellIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

/** A reminder with Done and Dismiss: closing one keeps it in the history. */
export function ReminderRow({
  reminderId,
  note,
  detail,
}: {
  reminderId: Id<'reminders'>
  note: string
  detail: string
}) {
  const { business } = useViewer()
  const close = useMutation(api.reminders.close)
  const act = (status: 'done' | 'dismissed') =>
    void close({ businessId: business._id, reminderId, status }).catch(
      (error: unknown) => toast.error(errorMessage(error)),
    )
  return (
    <li className="flex items-center gap-2 px-4 py-2">
      <BellIcon className="size-5 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{note}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
      <Button
        variant="ghost"
        size="icon-xl"
        aria-label={m.reminder_done()}
        onClick={() => act('done')}
      >
        <CheckIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xl"
        aria-label={m.reminder_dismiss()}
        onClick={() => act('dismissed')}
      >
        <XIcon />
      </Button>
    </li>
  )
}
