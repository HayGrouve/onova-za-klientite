import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
import { StageBadge } from '#/components/stage-badge'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useViewer } from '#/hooks/use-viewer'
import { GROUP_LABEL } from '#/i18n/groups'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import {
  STAGE_COLORS,
  STAGE_GROUPS,
  canRegroupStage,
  canRemoveStage,
} from '../../../shared/stages'
import type { StageColor, StageGroup } from '../../../shared/stages'

export const Route = createFileRoute('/_app/settings/stages')({
  component: StagesSettings,
})

type Stage = FunctionReturnType<
  typeof api.businesses.settings
>['stages'][number]

const COLOR_LABEL: Record<StageColor, () => string> = {
  gray: m.color_gray,
  blue: m.color_blue,
  amber: m.color_amber,
  violet: m.color_violet,
  green: m.color_green,
  red: m.color_red,
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
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="aria-pressed:border-primary aria-pressed:bg-primary/8"
        >
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
  const reorder = useMutation(api.stages.reorder)
  const [panel, setPanel] = useState<{ stage?: Stage } | null>(null)
  const owner = settings?.role === 'owner'

  const move = (stages: Stage[], index: number, by: number) => {
    const ids = stages.map((stage) => stage._id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved)
    void reorder({ businessId: business._id, stageIds: ids }).catch(
      (error: unknown) => toast.error(errorMessage(error)),
    )
  }

  return (
    <SettingsPage title={m.settings_stages()} help={m.stages_help()}>
      {!settings ? (
        <ListSkeleton />
      ) : (
        <>
          <ListCard>
            {settings.stages.map((stage, index) => (
              <li key={stage._id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  disabled={!owner}
                  onClick={() => setPanel({ stage })}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 pressable px-4 py-2 text-left"
                >
                  <StageBadge name={stage.name} color={stage.color} />
                  <span className="flex min-w-0 flex-col text-sm text-muted-foreground">
                    <span>{GROUP_LABEL[stage.group]()}</span>
                    {stage.jobCount > 0 && (
                      <span>
                        {m.stages_jobs({
                          jobs: business.words.job.plural,
                          count: stage.jobCount,
                        })}
                      </span>
                    )}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={m.stages_move_up()}
                  disabled={!owner || index === 0}
                  onClick={() => move(settings.stages, index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={m.stages_move_down()}
                  disabled={!owner || index === settings.stages.length - 1}
                  onClick={() => move(settings.stages, index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </li>
            ))}
          </ListCard>
          {owner && (
            <div className="px-4">
              <Button
                variant="outline"
                size="xl"
                className="shadow-xs"
                onClick={() => setPanel({})}
              >
                <PlusIcon data-icon="inline-start" />
                {m.stages_add()}
              </Button>
            </div>
          )}
          <Sheet
            open={panel !== null}
            onOpenChange={(open) => !open && setPanel(null)}
          >
            <SheetContent
              side="bottom"
              className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
            >
              <SheetHeader>
                <SheetTitle>{panel?.stage?.name ?? m.stages_add()}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                {panel && (
                  <StageForm
                    stage={panel.stage}
                    stages={settings.stages}
                    onDone={() => setPanel(null)}
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </SettingsPage>
  )
}

function StageForm({
  stage,
  stages,
  onDone,
}: {
  stage?: Stage
  stages: Stage[]
  onDone: () => void
}) {
  const { business } = useViewer()
  const add = useMutation(api.stages.add)
  const update = useMutation(api.stages.update)
  const remove = useMutation(api.stages.remove)
  const { busy, run } = useSubmit(onDone)
  const [name, setName] = useState(stage?.name ?? '')
  const [group, setGroup] = useState<StageGroup>(stage?.group ?? 'in_progress')
  const [color, setColor] = useState<StageColor>(stage?.color ?? 'gray')
  const [moveTo, setMoveTo] = useState<Id<'stages'> | null>(null)

  const regroupBlocked =
    stage && canRegroupStage(stages, stage._id, group) === 'lastInGroup'
  const removal = stage
    ? canRemoveStage(stages, stage._id, stage.jobCount)
    : null
  const others = stages.filter((item) => item._id !== stage?._id)

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
                  color,
                  group,
                })
              : add({ businessId: business._id, name, color, group }),
          )
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="stage-name">{m.stages_name()}</FieldLabel>
            <Input
              id="stage-name"
              required
              autoFocus={!stage}
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
              <p className="text-sm text-destructive">
                {m.stages_last_in_group()}
              </p>
            )}
          </Field>
          <Field>
            <FieldLabel>{m.stages_color()}</FieldLabel>
            <Choice
              label={m.stages_color()}
              value={color}
              options={STAGE_COLORS.map((value) => ({
                value,
                label: COLOR_LABEL[value](),
              }))}
              onChange={setColor}
            />
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
                          className="rounded-full outline-none aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2"
                        >
                          <StageBadge
                            name={other.name}
                            color={other.color}
                            className="h-9 px-3.5 text-sm"
                          />
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
              <Button
                variant="destructive"
                size="xl"
                disabled={busy || (removal === 'hasJobs' && !moveTo)}
                onClick={() =>
                  void run(() =>
                    remove({
                      businessId: business._id,
                      stageId: stage._id,
                      moveJobsTo: moveTo ?? undefined,
                    }),
                  )
                }
              >
                {m.stages_delete()}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  )
}
