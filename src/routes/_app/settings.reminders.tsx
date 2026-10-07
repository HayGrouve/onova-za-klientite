import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { monthsLabel } from '#/components/setup/steps'
import { ModuleOff } from '#/components/settings/module-off'
import { patchSettings } from '#/components/settings/optimistic'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { StageBadge } from '#/components/stage-badge'
import { Field, FieldLabel } from '#/components/ui/field'
import { Switch } from '#/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useToday } from '#/hooks/use-today'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { addMonths } from '../../../shared/dates'
import type { Words } from '../../../shared/words'

export const Route = createFileRoute('/_app/settings/reminders')({
  component: RemindersSettings,
})

const MONTHS = [3, 6, 12, 24]

// A reminder a year or two ahead needs its year.
const LONG_DAY = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function RemindersSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  const setRule = useMutation(
    api.businesses.setReminderRule,
  ).withOptimisticUpdate((store, { businessId, months }) =>
    patchSettings(store, businessId, {
      reminderRule: months === null ? null : { months },
    }),
  )
  const owner = settings?.role === 'owner'
  const save = (months: number | null) =>
    void setRule({ businessId: business._id, months }).catch((error: unknown) =>
      toast.error(errorMessage(error)),
    )

  const moduleOff = settings !== undefined && !settings.modules.reminders

  return (
    <SettingsPage
      title={m.settings_reminders()}
      help={m.reminders_rule_help()}
      preview={
        settings && (
          <SettingsPreview title={m.reminders_preview_title()}>
            <RulePreview
              words={settings.words}
              stage={
                settings.stages.find((stage) => stage.group === 'done')?.name
              }
              months={
                moduleOff ? null : (settings.reminderRule?.months ?? null)
              }
            />
          </SettingsPreview>
        )
      }
    >
      {!settings ? (
        <ListSkeleton />
      ) : (
        <div className="flex flex-col gap-5 px-4">
          {moduleOff && (
            <ModuleOff
              businessId={business._id}
              modules={settings.modules}
              module="reminders"
              owner={owner}
            >
              {m.reminders_module_off()}
            </ModuleOff>
          )}
          <Field orientation="horizontal">
            <FieldLabel htmlFor="reminder-rule">
              {m.reminders_rule_switch()}
            </FieldLabel>
            <Switch
              id="reminder-rule"
              disabled={!owner}
              checked={settings.reminderRule !== null}
              onCheckedChange={(checked) =>
                save(checked ? (settings.reminderRule?.months ?? 12) : null)
              }
            />
          </Field>
          {settings.reminderRule && (
            <Field>
              <FieldLabel>{m.reminders_rule_months()}</FieldLabel>
              <ToggleGroup
                aria-label={m.reminders_rule_months()}
                value={[String(settings.reminderRule.months)]}
                onValueChange={(next: string[]) => {
                  if (next[0]) save(Number(next[0]))
                }}
                variant="outline"
                size="xl"
                className="w-full flex-wrap"
                disabled={!owner}
              >
                {MONTHS.map((months) => (
                  <ToggleGroupItem key={months} value={String(months)}>
                    {monthsLabel(months)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}
        </div>
      )}
    </SettingsPage>
  )
}

/**
 * What happens when a job is marked done today: the rule's question with the
 * date it would suggest, or nothing at all while the rule is off.
 */
function RulePreview({
  words,
  stage,
  months,
}: {
  words: Words
  stage?: string
  months: number | null
}) {
  const today = useToday()
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-2">
        <span className="truncate font-medium">{words.job.singular}</span>
        <StageBadge name={stage ?? m.reminders_preview_done()} group="done" />
      </div>
      <Flash watch={months}>
        {months === null ? (
          <p className="py-2 text-muted-foreground">
            {m.reminders_preview_off()}
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <p className="font-semibold">{m.reminder_rule_title()}</p>
            <p className="text-muted-foreground">
              {m.reminder_rule_body({
                when: monthsLabel(months).toLocaleLowerCase('bg'),
              })}
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-2">
              <span className="text-muted-foreground">{m.reminder_date()}</span>
              <span className="font-medium tabular-nums">
                {LONG_DAY.format(
                  new Date(`${addMonths(today, months)}T12:00:00Z`),
                )}
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">
                {m.reminder_rule_add()}
              </span>
              <span className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium">
                {m.reminder_rule_skip()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {m.reminders_preview_today()}
            </p>
          </div>
        )}
      </Flash>
    </div>
  )
}
