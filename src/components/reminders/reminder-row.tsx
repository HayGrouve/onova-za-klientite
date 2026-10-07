import { BellIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Tip } from '#/components/tip'
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
    <li className="flex items-center gap-2 py-2 pr-1 pl-4">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <BellIcon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{note}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
      <Tip label={m.reminder_done()}>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={m.reminder_done()}
          className="hover:bg-green-100 hover:text-green-800"
          onClick={() => act('done')}
        >
          <CheckIcon weight="bold" />
        </Button>
      </Tip>
      <Tip label={m.reminder_dismiss()}>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={m.reminder_dismiss()}
          className="text-muted-foreground"
          onClick={() => act('dismissed')}
        >
          <XIcon />
        </Button>
      </Tip>
    </li>
  )
}
