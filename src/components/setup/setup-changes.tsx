import { m } from '#/paraglide/messages.js'
import type { Modules, SetupPlan, SetupSettings } from '../../../shared/setup'

function moduleName(key: keyof Modules, settings: SetupSettings) {
  switch (key) {
    case 'appointments':
      return settings.words.appointment.plural
    case 'items':
      return settings.words.item.plural
    case 'costs':
      return m.module_costs()
    case 'reminders':
      return m.module_reminders()
    case 'services':
      return m.module_services()
  }
}

/** What "Run setup again" is about to change (Q12). Nothing is ever deleted. */
export function SetupChanges({
  plan,
  settings,
}: {
  plan: SetupPlan
  settings: SetupSettings
}) {
  const join = (names: string[]) => names.join(', ')
  const lines = [
    plan.nameChange && m.setup_change_name(plan.nameChange),
    ...plan.wordChanges.map((change) => m.setup_change_word(change)),
    plan.stagesToAdd.length > 0 &&
      m.setup_change_stages({
        names: join(plan.stagesToAdd.map((stage) => stage.name)),
      }),
    plan.fieldsToAdd.length > 0 &&
      m.setup_change_fields({ names: join(plan.fieldsToAdd) }),
    plan.servicesToAdd.length + plan.servicesToUpdate.length > 0 &&
      m.setup_change_services({
        names: join(
          [...plan.servicesToAdd, ...plan.servicesToUpdate].map(
            (service) => service.name,
          ),
        ),
      }),
    plan.modulesOn.length > 0 &&
      m.setup_change_modules_on({
        names: join(plan.modulesOn.map((key) => moduleName(key, settings))),
      }),
    plan.modulesOff.length > 0 &&
      m.setup_change_modules_off({
        names: join(plan.modulesOff.map((key) => moduleName(key, settings))),
      }),
  ].filter((line) => typeof line === 'string')

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4 text-sm">
      <span className="font-medium">{m.setup_changes_title()}</span>
      {lines.length === 0 ? (
        <span className="text-muted-foreground">{m.setup_changes_none()}</span>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <span className="text-muted-foreground">{m.setup_changes_safe()}</span>
    </div>
  )
}
