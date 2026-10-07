import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { cn } from 'cn'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { BusinessSwitcher } from '#/components/app-shell'
import { JobFormPreview } from '#/components/setup/job-form-preview'
import { SetupChanges } from '#/components/setup/setup-changes'
import { STEP_BODY } from '#/components/setup/steps'
import { Stopwatch } from '#/components/stopwatch'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { recordTiming } from '#/lib/timing'
import { m } from '#/paraglide/messages.js'
import {
  SETUP_STEPS,
  clearStep,
  planSetup,
  settingsFromAnswers,
  stagesAfter,
} from '../../../shared/setup'
import type {
  CurrentSetup,
  SetupAnswers,
  SetupStep,
} from '../../../shared/setup'

const DONE = SETUP_STEPS.length

/**
 * Setup, prototype 1 variant C: the job form stays on screen and changes with
 * each answer; one question at a time below it; every step skippable.
 */
export function SetupWizard({
  businessId,
  current,
  initialAnswers,
}: {
  businessId: Id<'businesses'>
  current: CurrentSetup
  initialAnswers: SetupAnswers
}) {
  const navigate = useNavigate()
  const { businesses } = useViewer()
  const apply = useMutation(api.setup.apply)
  const [answers, setAnswers] = useState(initialAnswers)
  const [step, setStep] = useState(0)
  const [fromReview, setFromReview] = useState(false)
  const [pulse, setPulse] = useState(0)
  const [saving, setSaving] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [reviewedAt, setReviewedAt] = useState<number>()
  const previewRef = useRef<HTMLDivElement>(null)

  const key = SETUP_STEPS[step] as SetupStep | undefined
  const settings = useMemo(
    () => settingsFromAnswers(answers, current),
    [answers, current],
  )
  const plan = useMemo(() => planSetup(current, settings), [current, settings])
  // The stages the business will really have: a re-run keeps its own and only
  // adds the flow's missing ones.
  const stages = useMemo(() => stagesAfter(current, plan), [current, plan])
  const formSettings = useMemo(
    () => ({ ...settings, stages }),
    [settings, stages],
  )

  // Keep the part of the form this question changes in view.
  useEffect(() => {
    const container = previewRef.current
    const target = key && container?.querySelector(`[data-step="${key}"]`)
    if (!container || !target) return
    const offset =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({
      top: Math.max(0, offset - 48),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [key, pulse])

  const update = (patch: Partial<SetupAnswers>) => {
    setAnswers((before) => ({ ...before, ...patch }))
    setPulse((n) => n + 1)
  }
  const finish = () => {
    setStep(DONE)
    setFromReview(false)
    if (reviewedAt === undefined) {
      const now = Date.now()
      setReviewedAt(now)
      recordTiming('setup', now - startedAt)
    }
  }
  const next = () =>
    fromReview || step === DONE - 1 ? finish() : setStep(step + 1)
  const skip = () => {
    setAnswers((before) => clearStep(SETUP_STEPS[step], before))
    setPulse((n) => n + 1)
    next()
  }
  const edit = (target: SetupStep) => {
    setFromReview(true)
    setStep(SETUP_STEPS.indexOf(target))
  }
  const confirm = async () => {
    setSaving(true)
    try {
      await apply({ businessId, answers })
      const importing =
        answers.importFrom === 'phone' || answers.importFrom === 'excel'
      await navigate({ to: importing ? '/import' : '/', replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  const Body = key ? STEP_BODY[key] : null
  // Ways out of the questions: a quiet "skip all" to the review, and the
  // business switcher when there are several businesses to go to.
  const showHeader = businesses.length > 1 || step !== DONE

  return (
    // A wide screen puts the live form and the questions side by side.
    <main className="flex h-dvh flex-col bg-muted lg:flex-row lg:items-center lg:justify-center lg:gap-8 lg:p-8">
      <h1 className="sr-only">{m.setup_heading()}</h1>
      <Stopwatch startedAt={startedAt} stoppedAt={reviewedAt} />
      <div className="flex min-h-0 flex-1 flex-col lg:max-h-full lg:max-w-2xl">
        {showHeader && (
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top)] lg:px-1 lg:pt-0">
            <div className="min-w-0">
              {businesses.length > 1 && <BusinessSwitcher />}
            </div>
            {step !== DONE && (
              <Button
                variant="ghost"
                size="xl"
                className="px-3 text-sm text-muted-foreground"
                onClick={finish}
              >
                {m.setup_skip_all()}
              </Button>
            )}
          </div>
        )}
        <div
          ref={previewRef}
          tabIndex={0}
          role="region"
          aria-label={m.preview_label()}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:p-1',
            showHeader ? 'pt-1' : 'pt-[calc(1rem+env(safe-area-inset-top))]',
          )}
        >
          <p className="mb-2 text-sm text-muted-foreground">
            {step === DONE ? m.setup_preview_done() : m.setup_preview_title()}
          </p>
          <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-zinc-900/5">
            <JobFormPreview
              settings={formSettings}
              highlight={key ?? null}
              pulse={pulse}
              onEdit={step === DONE ? edit : undefined}
            />
          </div>
        </div>
      </div>

      <section className="flex max-h-[58%] flex-col rounded-t-3xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px] shadow-zinc-900/15 lg:max-h-[min(44rem,100%)] lg:w-md lg:shrink-0 lg:rounded-3xl lg:border lg:shadow-xl">
        {Body ? (
          <>
            <div
              key={key}
              className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in"
            >
              <Body
                answers={answers}
                update={update}
                words={settings.words}
                stages={stages}
              />
            </div>
            <div className="flex items-center gap-1 border-t px-2 py-3">
              <Button
                variant="ghost"
                size="icon-xl"
                aria-label={m.setup_back()}
                disabled={step === 0 && !fromReview}
                onClick={() => (fromReview ? finish() : setStep(step - 1))}
              >
                <ArrowLeftIcon />
              </Button>
              <div
                className="flex min-w-0 flex-1 justify-center gap-1"
                role="img"
                aria-label={m.setup_step_of({
                  step: step + 1,
                  total: SETUP_STEPS.length,
                })}
              >
                {SETUP_STEPS.map((stepKey, index) => (
                  <span
                    key={stepKey}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      index === step
                        ? 'w-5 bg-primary'
                        : index < step
                          ? 'w-1.5 bg-primary/40'
                          : 'w-1.5 bg-border',
                    )}
                  />
                ))}
              </div>
              <Button variant="ghost" size="xl" className="px-3" onClick={skip}>
                {m.setup_skip()}
              </Button>
              <Button size="xl" className="px-4" onClick={next}>
                {fromReview
                  ? m.setup_done()
                  : step === DONE - 1
                    ? m.setup_to_review()
                    : m.setup_next()}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
            <h1 className="text-xl font-semibold tracking-tight">
              {m.setup_review_title()}
            </h1>
            <p className="text-sm text-muted-foreground">
              {m.setup_review_body()}
            </p>
            {current.setupDone && (
              <SetupChanges plan={plan} settings={settings} />
            )}
            <Button size="xl" disabled={saving} onClick={() => void confirm()}>
              {saving && <Spinner data-icon="inline-start" />}
              {saving
                ? m.setup_saving()
                : current.setupDone
                  ? m.setup_review_save()
                  : m.setup_review_start()}
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}
