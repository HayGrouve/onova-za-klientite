import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  FlowArrowIcon,
} from '@phosphor-icons/react'
import { cn } from 'cn'
import { useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmQuestion } from '#/components/confirm-action'
import { Hint } from '#/components/hint'
import { Panel, PanelBody } from '#/components/panel'
import { Button } from '#/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { m } from '#/paraglide/messages.js'
import type { StageGroup } from '../../../shared/stages'

export type StageRef = { _id: Id<'stages'>; name: string; group: StageGroup }

// The current stage reads as a soft badge, so the filled button beside it is
// the one thing to press; colour follows its group (D53).
const CURRENT_STAGE: Record<StageGroup, string> = {
  new: 'bg-primary/10 text-primary',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-green-600/12 text-green-700 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive',
}

/** The current chip in the full list is filled in its group colour. */
const CURRENT_CHIP: Record<StageGroup, string> = {
  new: 'aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground',
  in_progress:
    'aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground',
  done: 'aria-pressed:bg-green-600 aria-pressed:text-white aria-pressed:hover:bg-green-600 aria-pressed:hover:text-white',
  cancelled:
    'aria-pressed:bg-destructive aria-pressed:text-white aria-pressed:hover:bg-destructive aria-pressed:hover:text-white',
}

/**
 * The next stage in the business's order, the usual move from here. Cancelled
 * stages are never "next"; a cancelled job has none.
 */
export function nextStage(stages: StageRef[], currentId: Id<'stages'>) {
  const index = stages.findIndex((stage) => stage._id === currentId)
  if (index < 0 || stages[index].group === 'cancelled') return undefined
  return stages.slice(index + 1).find((stage) => stage.group !== 'cancelled')
}

/**
 * Where the job is, and the one usual step forward. Every other stage waits
 * behind "Other stage", and a Cancelled-group stage asks before it moves,
 * since the rest of the money stops counting as owed. Read-only, it shows
 * only where the job is: moving a job is for managers.
 */
export function StagePicker({
  stages,
  currentId,
  jobTitle,
  onMove,
  readOnly = false,
  children,
}: {
  stages: StageRef[]
  currentId: Id<'stages'>
  jobTitle: string
  onMove: (stageId: Id<'stages'>) => void
  readOnly?: boolean
  /** More about the stage, under it (why the job was cancelled). */
  children?: React.ReactNode
}) {
  const [choosing, setChoosing] = useState(false)
  // The question holds the stage the job was in when it was asked: once the
  // job moves anyway (an undo, another device), it no longer applies.
  const [question, setQuestion] = useState<{
    stage: StageRef
    from: Id<'stages'>
  } | null>(null)
  const asking = question?.from === currentId ? question.stage : null
  const current = stages.find((stage) => stage._id === currentId)
  const next = nextStage(stages, currentId)

  const pick = (stage: StageRef) => {
    if (stage.group === 'cancelled') {
      setQuestion({ stage, from: currentId })
      return
    }
    setChoosing(false)
    onMove(stage._id)
  }

  const toggle = (
    <Button
      variant="ghost"
      className="h-9 text-primary"
      aria-expanded={choosing}
      onClick={() => {
        setChoosing(!choosing)
        setQuestion(null)
      }}
    >
      {choosing ? m.stage_other_hide() : m.stage_other()}
      <CaretDownIcon
        data-icon="inline-end"
        className={cn(
          'transition-transform duration-200',
          choosing && 'rotate-180',
        )}
      />
    </Button>
  )

  return (
    <Panel
      title={m.job_stage()}
      icon={FlowArrowIcon}
      hint={!readOnly && <Hint term={m.job_stage()}>{m.hint_stage()}</Hint>}
      action={!readOnly && toggle}
    >
      <PanelBody className="flex flex-col gap-3">
        {/* The full list marks the current stage itself. */}
        {!choosing && (
          <div className="flex flex-wrap items-center gap-2">
            {current && (
              <span
                className={cn(
                  'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-semibold break-words',
                  CURRENT_STAGE[current.group],
                )}
              >
                <CheckIcon
                  aria-hidden
                  className="size-4 shrink-0"
                  weight="bold"
                />
                {current.name}
              </span>
            )}
            {next && !readOnly && (
              <Button
                size="xl"
                className="ml-auto max-w-full whitespace-normal"
                onClick={() => pick(next)}
              >
                {m.stage_next({ stage: next.name })}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            )}
          </div>
        )}
        {choosing && (
          <ToggleGroup
            aria-label={m.job_stage()}
            value={[currentId]}
            onValueChange={(value: string[]) => {
              // The current stage can't be switched off: only a move counts.
              const stage = stages.find((item) => item._id === value[0])
              if (stage && stage._id !== currentId) pick(stage)
            }}
            className="w-full flex-wrap"
          >
            {stages.map((stage) => {
              const isCurrent = stage._id === currentId
              return (
                <ToggleGroupItem
                  key={stage._id}
                  value={stage._id}
                  className={cn(
                    'h-9 max-w-full rounded-full px-3.5 whitespace-normal ring-offset-0 duration-200 active:scale-95',
                    isCurrent
                      ? cn('shadow-sm', CURRENT_CHIP[stage.group])
                      : cn(
                          'bg-card ring-1 ring-border ring-inset hover:bg-muted',
                          stage.group === 'cancelled'
                            ? 'text-destructive'
                            : 'text-foreground/80',
                        ),
                  )}
                >
                  {isCurrent && (
                    <CheckIcon aria-hidden className="size-4" weight="bold" />
                  )}
                  {stage.name}
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        )}
        {asking && (
          <ConfirmQuestion
            question={m.stage_cancel_question({
              title: jobTitle,
              stage: asking.name,
            })}
            confirmLabel={m.stage_cancel_confirm()}
            cancelLabel={m.back()}
            onConfirm={() => {
              setQuestion(null)
              setChoosing(false)
              onMove(asking._id)
            }}
            onCancel={() => setQuestion(null)}
          />
        )}
        {children}
      </PanelBody>
    </Panel>
  )
}
