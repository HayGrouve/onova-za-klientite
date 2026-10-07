import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { SettingsPage } from '#/components/settings/settings-page'
import { Switch } from '#/components/ui/switch'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { MODULE_KEYS } from '../../../shared/setup'
import type { Modules } from '../../../shared/setup'

export const Route = createFileRoute('/_app/settings/modules')({
  component: ModulesSettings,
})

function ToggleRow({
  id,
  title,
  body,
  checked,
  disabled,
  onChange,
}: {
  id: string
  title: string
  body: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-3">
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{body}</span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </li>
  )
}

function ModulesSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  const setModules = useMutation(api.businesses.setModules)
  const setNewJob = useMutation(api.businesses.setNewJobOptions)
  const { words } = business
  const owner = settings?.role === 'owner'
  const fail = (error: unknown) => toast.error(errorMessage(error))

  const label: Record<keyof Modules, [string, string]> = {
    appointments: [words.appointment.plural, m.module_appointments_body()],
    costs: [m.module_costs(), m.module_costs_body()],
    items: [words.item.plural, m.module_items_body()],
    reminders: [m.module_reminders(), m.module_reminders_body()],
    services: [m.module_services(), m.module_services_body()],
  }

  return (
    <SettingsPage title={m.settings_modules()} help={m.modules_help()}>
      {!settings ? (
        <ListSkeleton />
      ) : (
        <ListCard>
          {MODULE_KEYS.map((key) => (
            <ToggleRow
              key={key}
              id={`module-${key}`}
              title={label[key][0]}
              body={label[key][1]}
              checked={settings.modules[key]}
              disabled={!owner}
              onChange={(checked) =>
                void setModules({
                  businessId: business._id,
                  modules: { ...settings.modules, [key]: checked },
                }).catch(fail)
              }
            />
          ))}
          <ToggleRow
            id="deposits"
            title={m.deposits_switch()}
            body={m.deposits_switch_body()}
            checked={settings.depositsOnNewJob}
            disabled={!owner}
            onChange={(checked) =>
              void setNewJob({
                businessId: business._id,
                depositsOnNewJob: checked,
              }).catch(fail)
            }
          />
        </ListCard>
      )}
    </SettingsPage>
  )
}
