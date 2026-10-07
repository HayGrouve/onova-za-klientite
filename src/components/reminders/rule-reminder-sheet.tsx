import type { Id } from '../../../convex/_generated/dataModel'
import { ReminderForm } from '#/components/reminders/reminder-form'
import { monthsLabel } from '#/components/setup/steps'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { addMonths } from '../../../shared/dates'

/**
 * The reminder rule's offer after a job reaches Done (Q5), pre-filled N months
 * ahead with the job's title. Open while `job` is set.
 */
export function RuleReminderSheet({
  job,
  onClose,
}: {
  job: { _id: Id<'jobs'>; title: string; itemId?: Id<'items'> } | null
  onClose: () => void
}) {
  const { business } = useViewer()
  const today = useToday()
  const rule = business.reminderRule
  return (
    <Sheet open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>{m.reminder_rule_title()}</SheetTitle>
        </SheetHeader>
        {job && rule && (
          <div className="px-4 pb-6">
            <p className="pb-4 text-sm">
              {m.reminder_rule_body({
                when: monthsLabel(rule.months).toLocaleLowerCase('bg'),
              })}
            </p>
            <ReminderForm
              businessId={business._id}
              target={{ jobId: job._id, itemId: job.itemId }}
              initialDate={addMonths(today, rule.months)}
              initialNote={job.title}
              source="rule"
              onDone={onClose}
              onSkip={onClose}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
