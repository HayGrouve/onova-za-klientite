import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { JobFormPreview } from '#/components/setup/job-form-preview'
import { JobPagePreview } from '#/components/settings/job-page-preview'
import { patchSettings } from '#/components/settings/optimistic'
import { SettingsPage } from '#/components/settings/settings-page'
import { SettingsPreview } from '#/components/settings/settings-preview'
import { Switch } from '#/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { MODULE_KEYS } from '../../../shared/setup'
import type {
  CurrentSetup,
  Modules,
  SetupSettings,
  SetupStep,
} from '../../../shared/setup'

export const Route = createFileRoute('/_app/settings/modules')({
  component: ModulesSettings,
})

type Switchable = keyof Modules | 'deposits'
type View = 'page' | 'form'

// Which view shows what a switch changes, and the part of setup's Job form it
// flashes there.
const SHOWN_IN: Record<Switchable, { view: View; step?: SetupStep }> = {
  appointments: { view: 'page' },
  costs: { view: 'page' },
  items: { view: 'form', step: 'item' },
  reminders: { view: 'page' },
  services: { view: 'form', step: 'services' },
  deposits: { view: 'form', step: 'money' },
}

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
  const setup = useQuery(api.setup.current, { businessId: business._id })
  const setModules = useMutation(
    api.businesses.setModules,
  ).withOptimisticUpdate((store, { businessId, modules }) =>
    patchSettings(store, businessId, { modules }),
  )
  const setNewJob = useMutation(
    api.businesses.setNewJobOptions,
  ).withOptimisticUpdate((store, { businessId, depositsOnNewJob }) =>
    patchSettings(store, businessId, { depositsOnNewJob }),
  )
  const [view, setView] = useState<View>('page')
  const [changed, setChanged] = useState<{ step?: SetupStep; pulse: number }>({
    pulse: 0,
  })
  const { words } = business
  const owner = settings?.role === 'owner'
  const fail = (error: unknown) => toast.error(errorMessage(error))
  const saved = () => toast.success(m.saved())
  // The switch just moved: show the view it changes, and mark the part.
  const show = (key: Switchable) => {
    setView(SHOWN_IN[key].view)
    setChanged(({ pulse }) => ({ step: SHOWN_IN[key].step, pulse: pulse + 1 }))
  }

  const label: Record<keyof Modules, [string, string]> = {
    appointments: [words.appointment.plural, m.module_appointments_body()],
    costs: [m.module_costs(), m.module_costs_body()],
    items: [words.item.plural, m.module_items_body()],
    reminders: [m.module_reminders(), m.module_reminders_body()],
    services: [m.module_services(), m.module_services_body()],
  }

  const preview = settings && setup && (
    <SettingsPreview
      scrollTo={
        changed.step && {
          selector: `[data-step="${changed.step}"]`,
          key: changed.pulse,
        }
      }
    >
      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <TabsList className="mb-3 h-9 w-full">
          <TabsTrigger value="page" className="px-2">
            {words.job.singular}
          </TabsTrigger>
          <TabsTrigger value="form" className="px-2">
            {m.new_job({ job: words.job.singular })}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'page' ? (
        <JobPagePreview words={words} modules={settings.modules} />
      ) : (
        <JobFormPreview
          settings={formSettings(
            setup.current,
            settings.modules,
            settings.depositsOnNewJob,
          )}
          highlight={changed.step ?? null}
          pulse={changed.pulse}
        />
      )}
    </SettingsPreview>
  )

  return (
    <SettingsPage
      title={m.settings_modules()}
      help={m.modules_help()}
      preview={preview}
    >
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
              onChange={(checked) => {
                show(key)
                void setModules({
                  businessId: business._id,
                  modules: { ...settings.modules, [key]: checked },
                })
                  .then(saved)
                  .catch(fail)
              }}
            />
          ))}
          <ToggleRow
            id="deposits"
            title={m.deposits_switch()}
            body={m.deposits_switch_body()}
            checked={settings.depositsOnNewJob}
            disabled={!owner}
            onChange={(checked) => {
              show('deposits')
              void setNewJob({
                businessId: business._id,
                depositsOnNewJob: checked,
              })
                .then(saved)
                .catch(fail)
            }}
          />
        </ListCard>
      )}
    </SettingsPage>
  )
}

/** Setup's Job form, drawn from the business as it is now. */
function formSettings(
  current: CurrentSetup,
  modules: Modules,
  depositsOnNewJob: boolean,
): SetupSettings {
  return {
    ...current,
    modules,
    depositsOnNewJob,
    stages: current.stages.map((stage) => ({ ...stage, color: 'blue' })),
    item: modules.items
      ? { word: current.words.item, fields: current.itemFields }
      : null,
    services: modules.services ? current.services : [],
  }
}
