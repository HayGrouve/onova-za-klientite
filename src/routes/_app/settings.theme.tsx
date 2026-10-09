import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/components/settings/settings-page'
import { Field, FieldLabel } from '#/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { THEME_CHOICES, saveTheme, useTheme } from '#/lib/theme'
import type { ThemeChoice } from '#/lib/theme'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/theme')({
  component: ThemeSettings,
})

const CHOICES: Record<ThemeChoice, { icon: Icon; label: () => string }> = {
  light: { icon: SunIcon, label: m.theme_light },
  dark: { icon: MoonIcon, label: m.theme_dark },
  system: { icon: DesktopIcon, label: m.theme_system },
}

/** Per device and for everyone, Workers too: the whole app is its preview. */
function ThemeSettings() {
  const theme = useTheme()
  return (
    <SettingsPage title={m.settings_theme()} help={m.theme_help()}>
      <div className="px-4">
        <Field>
          <FieldLabel>{m.theme_label()}</FieldLabel>
          <ToggleGroup
            aria-label={m.theme_label()}
            value={[theme]}
            onValueChange={(next: string[]) => {
              const choice = THEME_CHOICES.find((value) => value === next[0])
              if (choice) saveTheme(choice)
            }}
            variant="outline"
            size="xl"
            className="w-full flex-wrap"
          >
            {THEME_CHOICES.map((choice) => {
              const { icon: IconComponent, label } = CHOICES[choice]
              return (
                <ToggleGroupItem key={choice} value={choice}>
                  <IconComponent className="size-5" />
                  {label()}
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </Field>
      </div>
    </SettingsPage>
  )
}
