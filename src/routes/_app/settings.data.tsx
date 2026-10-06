import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/components/settings/settings-page'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/data')({
  component: DataSettings,
})

// Milestone 9 fills this in: import, export, merge, anonymize, delete.
function DataSettings() {
  return (
    <SettingsPage title={m.settings_data()}>
      <p className="px-4 text-muted-foreground">{m.data_soon()}</p>
    </SettingsPage>
  )
}
