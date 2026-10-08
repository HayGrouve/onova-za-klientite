import { BellIcon, CheckIcon, ClockIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PICK_LABEL } from '#/components/reminders/date-picks'
import { Tip } from '#/components/tip'
import { Button, buttonVariants } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { isOverdue } from '../../../shared/dates'
import { SNOOZE_PICKS, pickReminderDate } from '../../../shared/reminders'

const UNDO_MS = 8000

/**
 * A reminder with Done, Snooze and Dismiss, each named in words. Closing one
 * keeps it in the history and offers "Undo" for a few seconds. The text opens
 * the job, else the item, else the client, when the page passes them; `date`
 * marks the row late once it has passed.
 */
export function ReminderRow({
  reminderId,
  note,
  detail,
  date,
  clientId,
  jobId,
  itemId,
}: {
  reminderId: Id<'reminders'>
  note: string
  detail: string
  date?: string
  clientId?: Id<'clients'>
  jobId?: Id<'jobs'>
  itemId?: Id<'items'>
}) {
  const { business } = useViewer()
  const today = useToday()
  const close = useMutation(api.reminders.close)
  const reopen = useMutation(api.reminders.reopen)
  const snooze = useMutation(api.reminders.snooze)
  const late = date !== undefined && isOverdue(date, today)
  const scope = { businessId: business._id, reminderId }
  const fail = (error: unknown) => toast.error(errorMessage(error))
  const undoable = (message: string, undo: () => Promise<unknown>) =>
    toast(message, {
      duration: UNDO_MS,
      action: {
        label: m.reminder_undo(),
        onClick: () => void undo().catch(fail),
      },
    })
  // View offline, edit online (ADR 0010).
  const online = () => {
    if (navigator.onLine) return true
    toast.error(m.offline_edit_blocked())
    return false
  }

  const finish = (status: 'done' | 'dismissed') => {
    if (!online()) return
    void close({ ...scope, status })
      .then(() =>
        undoable(
          status === 'done'
            ? m.reminder_done_toast()
            : m.reminder_dismissed_toast(),
          () => reopen(scope),
        ),
      )
      .catch(fail)
  }
  const postpone = (to: string) => {
    if (!online()) return
    void snooze({ ...scope, date: to })
      .then((from) => {
        if (from === null) return
        undoable(m.reminder_snoozed_toast({ when: formatDay(to, today) }), () =>
          snooze({ ...scope, date: from }),
        )
      })
      .catch(fail)
  }

  const text = (
    <>
      <span className="font-medium">{note}</span>
      <span className="text-sm text-muted-foreground">
        {late && (
          <span className="font-medium text-destructive">
            {m.reminder_late()}
            {' · '}
          </span>
        )}
        {detail}
      </span>
    </>
  )
  const textClass = 'flex min-w-0 flex-1 flex-col'
  const linkClass = cn(textClass, 'underline-offset-4 hover:underline')

  return (
    <li className="flex flex-col gap-1.5 py-2.5 pr-3 pl-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            late
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <BellIcon className="size-5" />
        </span>
        {jobId ? (
          <Link to="/jobs/$jobId" params={{ jobId }} className={linkClass}>
            {text}
          </Link>
        ) : itemId ? (
          <Link to="/items/$itemId" params={{ itemId }} className={linkClass}>
            {text}
          </Link>
        ) : clientId ? (
          <Link
            to="/clients/$clientId"
            params={{ clientId }}
            className={linkClass}
          >
            {text}
          </Link>
        ) : (
          <span className={textClass}>{text}</span>
        )}
      </div>
      {/* Under the text where there's room; from the edge on a narrow phone, so the three fit on one line. */}
      <div className="flex flex-wrap items-center gap-1.5 min-[440px]:pl-12">
        <Tip label={m.reminder_done_tip()} side="top">
          <Button
            variant="outline"
            className="h-11 rounded-xl px-2.5 hover:bg-green-100 hover:text-green-800 dark:hover:bg-green-950 dark:hover:text-green-300"
            onClick={() => finish('done')}
          >
            <CheckIcon weight="bold" data-icon="inline-start" />
            {m.reminder_done()}
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({
              variant: 'outline',
              className: 'h-11 rounded-xl px-2.5',
            })}
          >
            <ClockIcon data-icon="inline-start" />
            {m.reminder_snooze()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {SNOOZE_PICKS.map((pick) => (
              <DropdownMenuItem
                key={pick}
                className="min-h-10"
                onClick={() => postpone(pickReminderDate(today, pick))}
              >
                {PICK_LABEL[pick]()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tip label={m.reminder_dismiss_tip()} side="top">
          <Button
            variant="ghost"
            className="h-11 rounded-xl px-2.5 text-muted-foreground"
            onClick={() => finish('dismissed')}
          >
            <XIcon data-icon="inline-start" />
            {m.reminder_dismiss()}
          </Button>
        </Tip>
      </div>
    </li>
  )
}
