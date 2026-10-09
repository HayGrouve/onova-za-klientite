import {
  ArrowsClockwiseIcon,
  BellIcon,
  BellRingingIcon,
  DatabaseIcon,
  FlowArrowIcon,
  ListPlusIcon,
  PuzzlePieceIcon,
  StorefrontIcon,
  TagIcon,
  TextAaIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { runChange } from '#/lib/change'
import { m } from '#/paraglide/messages.js'

export type SettingsSection = {
  to: LinkProps['to']
  icon: Icon
  title: string
  body: string
}

export type SettingsGroup = { title: string; sections: SettingsSection[] }

/**
 * The settings sections under three headings, in order: the phone's list and
 * the wide screen's side menu. What the business is, how it works, its data.
 */
export function settingsGroups(): SettingsGroup[] {
  return [
    {
      title: m.settings_group_business(),
      sections: [
        {
          to: '/settings/business',
          icon: StorefrontIcon,
          title: m.settings_business(),
          body: m.settings_business_body(),
        },
        {
          to: '/settings/names',
          icon: TextAaIcon,
          title: m.settings_names(),
          body: m.settings_names_body(),
        },
        {
          to: '/settings/modules',
          icon: PuzzlePieceIcon,
          title: m.settings_modules(),
          body: m.settings_modules_body(),
        },
      ],
    },
    {
      title: m.settings_group_work(),
      sections: [
        {
          to: '/settings/stages',
          icon: FlowArrowIcon,
          title: m.settings_stages(),
          body: m.settings_stages_body(),
        },
        {
          to: '/settings/fields',
          icon: ListPlusIcon,
          title: m.settings_fields(),
          body: m.settings_fields_body(),
        },
        {
          to: '/settings/services',
          icon: TagIcon,
          title: m.settings_services(),
          body: m.settings_services_body(),
        },
        {
          to: '/settings/notifications',
          icon: BellRingingIcon,
          title: m.push_title(),
          body: m.push_help(),
        },
        {
          to: '/settings/reminders',
          icon: BellIcon,
          title: m.settings_reminders(),
          body: m.settings_reminders_body(),
        },
      ],
    },
    {
      title: m.settings_group_data(),
      sections: [
        {
          to: '/settings/data',
          icon: DatabaseIcon,
          title: m.settings_data(),
          body: m.settings_data_body(),
        },
        {
          to: '/setup',
          icon: ArrowsClockwiseIcon,
          title: m.settings_run_setup(),
          body: m.settings_run_setup_body(),
        },
      ],
    },
  ]
}

/** Q13: a second business opens setup for itself; the switcher then appears. */
export function useAddBusiness() {
  const createAnother = useMutation(api.businesses.createAnother)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const add = () => {
    setBusy(true)
    void runChange(() => createAnother({})).then((created) =>
      created.done ? navigate({ to: '/setup' }) : setBusy(false),
    )
  }
  return { add, busy }
}
