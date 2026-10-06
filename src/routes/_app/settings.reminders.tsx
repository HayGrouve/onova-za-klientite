import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { monthsLabel } from '#/components/setup/steps'
import { SettingsPage } from '#/components/settings/settings-page'
import { Field, FieldLabel } from '#/components/ui/field'
import { Switch } from '#/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/reminders')({
  component: RemindersSettings,
})

const MONTHS = [3, 6, 12, 24]

function RemindersSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  const setRule = useMutation(api.businesses.setReminderRule)
  const owner = settings?.role === 'owner'
  const save = (months: number | null) =>
    void setRule({ businessId: business._id, months }).catch((error: unknown) =>
      toast.error(errorMessage(error)),
    )

  return (
    <SettingsPage title={m.settings_reminders()} help={m.reminders_rule_help()}>
      {!settings ? (
        <ListSkeleton />
      ) : (
        <div className="flex flex-col gap-5 px-4">
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
                  <ToggleGroupItem
                    key={months}
                    value={String(months)}
                    className="aria-pressed:border-primary aria-pressed:bg-primary/8"
                  >
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
