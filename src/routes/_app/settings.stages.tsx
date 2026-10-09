import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { cn } from 'cn'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '#/components/confirm-action'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { StageBadge } from '#/components/stage-badge'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { BottomSheet } from '#/components/bottom-sheet'
import { Spinner } from '#/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useViewer } from '#/hooks/use-viewer'
import { GROUP_LABEL, GROUP_MEANING } from '#/i18n/groups'
import { lower } from '#/i18n/words'
import { runChange } from '#/lib/change'
import { m } from '#/paraglide/messages.js'
import {
  STAGE_GROUPS,
  canRegroupStage,
  canRemoveStage,
  groupedOrder,
} from '../../../shared/stages'
import { hasRole } from '../../../shared/roles'
import type { StageGroup } from '../../../shared/stages'

export const Route = createFileRoute('/_app/settings/stages')({
  component: StagesSettings,
})

type Stage = FunctionReturnType<
  typeof api.businesses.settings
>['stages'][number] & {
  /** How many jobs the stage holds: 0 for a Worker, who isn't told. */
  jobCount: number
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next: string[]) => {
        if (next[0]) onChange(next[0] as T)
      }}
      variant="outline"
      size="xl"
      className="w-full flex-wrap"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function StagesSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  // The counts have their own query, so no other Settings screen reads jobs.
  const seesCounts = hasRole(business.role, 'manager')
  const counts = useQuery(
    api.businesses.stageJobCounts,
    seesCounts ? { businessId: business._id } : 'skip',
  )
  const stages: Stage[] | undefined =
    settings && (counts !== undefined || !seesCounts)
      ? settings.stages.map((stage) => ({
          ...stage,
          jobCount:
            counts?.find((item) => item.stageId === stage._id)?.jobCount ?? 0,
        }))
      : undefined
  const reorder = useMutation(api.stages.reorder)
  const [panel, setPanel] = useState<{
    stage?: Stage
    group?: StageGroup
  } | null>(null)
  const owner = settings?.role === 'owner'

  // Stages move only inside their group, so each group stays together.
  const move = (ordered: Stage[], stageId: Stage['_id'], by: -1 | 1) => {
    const ids = groupedOrder(ordered)
    const index = ids.indexOf(stageId)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    void runChange(() => reorder({ businessId: business._id, stageIds: ids }))
  }

  return (
    <SettingsPage
      title={m.settings_stages()}
      help={m.stages_help()}
      preview={
        stages && (
          <SettingsPreview>
            <StagesPreview stages={stages} job={business.words.job.singular} />
          </SettingsPreview>
        )
      }
    >
      {!settings || !stages ? (
        <ListSkeleton />
      ) : (
        <>
          {STAGE_GROUPS.map((group) => {
            const inGroup = stages.filter((stage) => stage.group === group)
            return (
              <section key={group} className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-3 px-4">
                  <div className="flex min-w-0 flex-col">
                    <h2 className="font-semibold">{GROUP_LABEL[group]()}</h2>
                    <p className="text-sm text-muted-foreground">
                      {GROUP_MEANING[group]()}
                    </p>
                  </div>
                  {owner && (
                    <Button
                      variant="ghost"
                      className="h-11 shrink-0 text-primary lg:h-10"
                      onClick={() => setPanel({ group })}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {m.stages_add_short()}
                    </Button>
                  )}
                </div>
                {inGroup.length > 0 && (
                  <ListCard>
                    {inGroup.map((stage, index) => (
                      <li
                        key={stage._id}
                        className="flex items-center gap-1 pr-2"
                      >
                        <button
                          type="button"
                          disabled={!owner}
                          onClick={() => setPanel({ stage })}
                          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 pressable px-4 py-2 text-left"
                        >
                          <StageBadge name={stage.name} group={stage.group} />
                          {stage.jobCount > 0 && (
                            <span className="text-sm text-muted-foreground">
                              {m.stages_jobs({
                                jobs: business.words.job.plural,
                                count: stage.jobCount,
                              })}
                            </span>
                          )}
                        </button>
                        {inGroup.length > 1 && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-lg"
                              aria-label={m.stages_move_up()}
                              disabled={!owner || index === 0}
                              onClick={() => move(stages, stage._id, -1)}
                            >
                              <ArrowUpIcon />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-lg"
                              aria-label={m.stages_move_down()}
                              disabled={!owner || index === inGroup.length - 1}
                              onClick={() => move(stages, stage._id, 1)}
                            >
                              <ArrowDownIcon />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ListCard>
                )}
              </section>
            )
          })}
          <BottomSheet
            open={panel !== null}
            onClose={() => setPanel(null)}
            title={panel?.stage?.name ?? m.stages_add()}
          >
            <div className="px-4 pb-6">
              {panel && (
                <StageForm
                  stage={panel.stage}
                  group={panel.group}
                  stages={stages}
                  onDone={() => setPanel(null)}
                />
              )}
            </div>
          </BottomSheet>
        </>
      )}
    </SettingsPage>
  )
}

/** The stages as a job page offers them, in order, the first one picked. */
function StagesPreview({ stages, job }: { stages: Stage[]; job: string }) {
  const ids = groupedOrder(stages)
  const ordered = ids.flatMap(
    (id) => stages.find((stage) => stage._id === id) ?? [],
  )
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-medium">
        {m.stages_preview_page({ job: lower(job) })}
      </p>
      <Flash
        watch={ordered.map((stage) => [stage.name, stage.group])}
        className="flex flex-wrap gap-1.5 py-1"
      >
        {ordered.map((stage, index) => (
          <StageBadge
            key={stage._id}
            name={stage.name}
            group={stage.group}
            className={cn(
              index === 0 && 'bg-primary text-primary-foreground ring-primary',
            )}
          />
        ))}
      </Flash>
    </div>
  )
}

function StageForm({
  stage,
  group: initialGroup,
  stages,
  onDone,
}: {
  stage?: Stage
  /** The group a new stage starts in: the section it was added from. */
  group?: StageGroup
  stages: Stage[]
  onDone: () => void
}) {
  const { business } = useViewer()
  const add = useMutation(api.stages.add)
  const update = useMutation(api.stages.update)
  const remove = useMutation(api.stages.remove)
  const { busy, run } = useSubmit(onDone)
  const [name, setName] = useState(stage?.name ?? '')
  const [group, setGroup] = useState<StageGroup>(
    stage?.group ?? initialGroup ?? 'in_progress',
  )
  const [moveTo, setMoveTo] = useState<Id<'stages'> | null>(null)

  const regroupBlocked =
    stage && canRegroupStage(stages, stage._id, group) === 'lastInGroup'
  const removal = stage
    ? canRemoveStage(stages, stage._id, stage.jobCount)
    : null
  const others = stages.filter((item) => item._id !== stage?._id)
  const moveTarget = others.find((item) => item._id === moveTo)

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() =>
            stage
              ? update({
                  businessId: business._id,
                  stageId: stage._id,
                  name,
                  group,
                })
              : add({ businessId: business._id, name, group }),
          )
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="stage-name">{m.stages_name()}</FieldLabel>
            <Input
              id="stage-name"
              required
              name="stage-name"
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{m.stages_group()}</FieldLabel>
            <Choice
              label={m.stages_group()}
              value={group}
              options={STAGE_GROUPS.map((value) => ({
                value,
                label: GROUP_LABEL[value](),
              }))}
              onChange={setGroup}
            />
            {stage && stage.jobCount > 0 && group !== stage.group && (
              <FieldDescription>{m.stages_regroup_note()}</FieldDescription>
            )}
            {regroupBlocked && (
              <p role="alert" className="text-sm text-destructive">
                {m.stages_last_in_group()}
              </p>
            )}
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          size="xl"
          disabled={busy || !name.trim() || regroupBlocked}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
      </form>

      {stage && (
        <section className="flex flex-col gap-3 border-t pt-5">
          {removal === 'lastInGroup' ? (
            <p className="text-sm text-muted-foreground">
              {m.stages_last_in_group()}
            </p>
          ) : (
            <>
              {removal === 'hasJobs' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {m.stages_has_jobs()}
                  </p>
                  <Field>
                    <FieldLabel>{m.stages_delete_move()}</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {others.map((other) => (
                        <button
                          key={other._id}
                          type="button"
                          aria-pressed={moveTo === other._id}
                          onClick={() => setMoveTo(other._id)}
                          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2"
                        >
                          <StageBadge
                            name={other.name}
                            group={other.group}
                            className="h-9 px-3.5 text-sm"
                          />
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
              {removal === 'hasJobs' && !moveTo ? (
                <Button type="button" variant="destructive" size="xl" disabled>
                  {m.stages_delete()}
                </Button>
              ) : (
                <ConfirmAction
                  label={m.stages_delete()}
                  question={
                    removal === 'hasJobs' && moveTarget
                      ? m.stages_delete_ask_move({ stage: moveTarget.name })
                      : m.stages_delete_ask()
                  }
                  busy={busy}
                  onConfirm={() =>
                    void run(() =>
                      remove({
                        businessId: business._id,
                        stageId: stage._id,
                        moveJobsTo: moveTo ?? undefined,
                      }),
                    )
                  }
                />
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
