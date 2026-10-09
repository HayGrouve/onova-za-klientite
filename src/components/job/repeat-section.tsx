import { RepeatIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toastError } from '#/lib/toast-error'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '#/components/confirm-action'
import { useSubmit } from '#/components/money/use-submit'
import { REPEAT_LABEL } from '#/components/setup/steps'
import { Button, buttonVariants } from '#/components/ui/button'
import { Panel, PanelBody } from '#/components/panel'
import { useViewer } from '#/hooks/use-viewer'
import { formatLongDay } from '#/i18n/dates'
import { lower } from '#/i18n/words'
import { m } from '#/paraglide/messages.js'
import {
  REPEAT_CHOICES,
  nextJobDate,
  pickJobDate,
} from '../../../shared/repeat'
import type { RepeatInterval } from '../../../shared/repeat'

export function repeatLabel(repeat: RepeatInterval) {
  const choice = REPEAT_CHOICES.find(
    (item) => item.every === repeat.every && item.unit === repeat.unit,
  )
  if (choice) return REPEAT_LABEL[choice.key]()
  return repeat.unit === 'week'
    ? m.repeat_every_weeks({ every: repeat.every })
    : m.repeat_every_months({ every: repeat.every })
}

/**
 * Repeat (Q6): on, how often, or stop. The next job appears when this one's
 * date arrives (D41), and the date it gets is shown here before and after.
 * `appointments` are the job's live ones, as the Job page already has them.
 */
export function RepeatSection({
  job,
  appointments,
}: {
  job: Doc<'jobs'>
  appointments: ReadonlyArray<{ start: number }>
}) {
  const { business } = useViewer()
  const setRepeat = useMutation(api.jobs.setRepeat)
  const stopRepeat = useMutation(api.jobs.stopRepeat)
  const { busy, run } = useSubmit()
  // How often is asked only once someone means to repeat the job.
  const [choosing, setChoosing] = useState(false)
  const active = job.repeat && job.repeat.stoppedAt === undefined
  const dated = { appointments, dueDate: job.dueDate }

  return (
    <Panel title={m.repeat_title()} icon={RepeatIcon}>
      {active && job.repeat ? (
        <PanelBody className="flex flex-col items-start gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {m.repeat_on({ every: lower(repeatLabel(job.repeat)) })}
            </span>
            <NextLine
              nextJobId={job.repeat.nextJobId}
              date={nextJobDate(dated, job.repeat)}
            />
          </div>
          <div className="w-full">
            <ConfirmAction
              variant="outline"
              label={m.repeat_stop()}
              question={m.repeat_stop_question()}
              busy={busy}
              onConfirm={() => {
                // Stopped, it shows the one "Repeat" line again, not the intervals.
                setChoosing(false)
                void run(
                  () =>
                    stopRepeat({ businessId: business._id, jobId: job._id }),
                  m.repeat_stopped(),
                )
              }}
            />
          </div>
        </PanelBody>
      ) : !pickJobDate(dated) ? (
        <PanelBody className="text-sm text-muted-foreground">
          {m.repeat_needs_date()}
        </PanelBody>
      ) : !choosing ? (
        <PanelBody className="flex items-center justify-between gap-3 py-2 pr-2">
          <span className="text-sm text-muted-foreground">
            {m.repeat_off()}
          </span>
          <Button
            variant="ghost"
            className="h-11 text-primary lg:h-9"
            onClick={() => setChoosing(true)}
          >
            <RepeatIcon data-icon="inline-start" />
            {m.repeat_start()}
          </Button>
        </PanelBody>
      ) : (
        <PanelBody className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {m.setup_repeat_every()}
          </p>
          <div className="flex flex-wrap gap-2">
            {REPEAT_CHOICES.map((choice) => (
              <Button
                key={choice.key}
                variant="outline"
                className="h-11 rounded-xl"
                disabled={busy}
                onClick={() => {
                  const date = nextJobDate(dated, choice)
                  if (!date) return toastError(m.repeat_needs_date())
                  void run(
                    () =>
                      setRepeat({
                        businessId: business._id,
                        jobId: job._id,
                        every: choice.every,
                        unit: choice.unit,
                      }),
                    m.repeat_started({ date: formatLongDay(date) }),
                  )
                }}
              >
                {REPEAT_LABEL[choice.key]()}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="h-11 rounded-xl"
              onClick={() => setChoosing(false)}
            >
              {m.cancel()}
            </Button>
          </div>
        </PanelBody>
      )}
    </Panel>
  )
}

/** What happens next: the next job exists already, it will get a date, or nothing can be made. */
function NextLine({
  nextJobId,
  date,
}: {
  nextJobId?: Doc<'jobs'>['_id']
  date: string | null
}) {
  if (nextJobId) {
    return (
      <Link
        to="/jobs/$jobId"
        params={{ jobId: nextJobId }}
        className={buttonVariants({
          variant: 'link',
          className: 'h-9 justify-start px-0',
        })}
      >
        {m.repeat_next_created()}
      </Link>
    )
  }
  return (
    <span className="text-sm text-muted-foreground">
      {date
        ? m.repeat_next_date({ date: formatLongDay(date) })
        : m.repeat_needs_date()}
    </span>
  )
}
