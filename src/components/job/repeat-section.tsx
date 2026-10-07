import { RepeatIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { REPEAT_LABEL } from '#/components/setup/steps'
import { Button, buttonVariants } from '#/components/ui/button'
import { Panel, PanelBody } from '#/components/panel'
import { useViewer } from '#/hooks/use-viewer'
import { lower } from '#/i18n/words'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import type { RepeatEvery } from '../../../shared/setup'

const CHOICES: Array<{
  key: RepeatEvery
  every: number
  unit: 'week' | 'month'
}> = [
  { key: 'week', every: 1, unit: 'week' },
  { key: '2weeks', every: 2, unit: 'week' },
  { key: 'month', every: 1, unit: 'month' },
]

export function repeatLabel(repeat: { every: number; unit: 'week' | 'month' }) {
  const choice = CHOICES.find(
    (item) => item.every === repeat.every && item.unit === repeat.unit,
  )
  return choice ? REPEAT_LABEL[choice.key]() : `${repeat.every} ${repeat.unit}`
}

/** Repeat (Q6): on, how often, or stop. The next job appears when this one's date arrives. */
export function RepeatSection({ job }: { job: Doc<'jobs'> }) {
  const { business } = useViewer()
  const setRepeat = useMutation(api.jobs.setRepeat)
  const stopRepeat = useMutation(api.jobs.stopRepeat)
  const fail = (error: unknown) => toast.error(errorMessage(error))
  const active = job.repeat && job.repeat.stoppedAt === undefined

  return (
    <Panel title={m.repeat_title()} icon={RepeatIcon}>
      {active && job.repeat ? (
        <PanelBody className="flex flex-wrap items-center gap-2 py-1.5 pr-1.5">
          <span className="text-sm">
            {m.repeat_on({ every: lower(repeatLabel(job.repeat)) })}
          </span>
          {job.repeat.nextJobId && (
            <Link
              to="/jobs/$jobId"
              params={{ jobId: job.repeat.nextJobId }}
              className={buttonVariants({
                variant: 'link',
                className: 'h-9 px-1',
              })}
            >
              {m.repeat_next_created()}
            </Link>
          )}
          <Button
            variant="ghost"
            className="h-9"
            onClick={() =>
              void stopRepeat({
                businessId: business._id,
                jobId: job._id,
              }).catch(fail)
            }
          >
            {m.repeat_stop()}
          </Button>
        </PanelBody>
      ) : (
        <PanelBody className="flex flex-wrap gap-2">
          {CHOICES.map((choice) => (
            <Button
              key={choice.key}
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() =>
                void setRepeat({
                  businessId: business._id,
                  jobId: job._id,
                  every: choice.every,
                  unit: choice.unit,
                }).catch(fail)
              }
            >
              {REPEAT_LABEL[choice.key]()}
            </Button>
          ))}
        </PanelBody>
      )}
    </Panel>
  )
}
