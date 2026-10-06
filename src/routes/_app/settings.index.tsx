import {
  ArrowsClockwiseIcon,
  BellIcon,
  CaretRightIcon,
  DatabaseIcon,
  FlowArrowIcon,
  ListPlusIcon,
  PuzzlePieceIcon,
  StorefrontIcon,
  TagIcon,
  TextAaIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/')({
  component: SettingsIndex,
})

function Row({
  to,
  icon: IconComponent,
  title,
  body,
}: {
  to: LinkProps['to']
  icon: Icon
  title: string
  body: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <IconComponent className="size-6 shrink-0 text-primary" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{title}</span>
          <span className="truncate text-sm text-muted-foreground">{body}</span>
        </span>
        <CaretRightIcon className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

function SettingsIndex() {
  const { business, businesses } = useViewer()
  const role = businesses.find((item) => item._id === business._id)?.role
  return (
    <>
      <PageTitle>{m.settings_title()}</PageTitle>
      {role !== 'owner' && (
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          {m.settings_owner_only()}
        </p>
      )}
      <ul className="flex flex-col">
        <Row
          to="/settings/business"
          icon={StorefrontIcon}
          title={m.settings_business()}
          body={m.settings_business_body()}
        />
        <Row
          to="/settings/names"
          icon={TextAaIcon}
          title={m.settings_names()}
          body={m.settings_names_body()}
        />
        <Row
          to="/settings/modules"
          icon={PuzzlePieceIcon}
          title={m.settings_modules()}
          body={m.settings_modules_body()}
        />
        <Row
          to="/settings/stages"
          icon={FlowArrowIcon}
          title={m.settings_stages()}
          body={m.settings_stages_body()}
        />
        <Row
          to="/settings/fields"
          icon={ListPlusIcon}
          title={m.settings_fields()}
          body={m.settings_fields_body()}
        />
        <Row
          to="/settings/services"
          icon={TagIcon}
          title={m.settings_services()}
          body={m.settings_services_body()}
        />
        <Row
          to="/settings/reminders"
          icon={BellIcon}
          title={m.settings_reminders()}
          body={m.settings_reminders_body()}
        />
        <Row
          to="/settings/data"
          icon={DatabaseIcon}
          title={m.settings_data()}
          body={m.settings_data_body()}
        />
        <Row
          to="/setup"
          icon={ArrowsClockwiseIcon}
          title={m.settings_run_setup()}
          body={m.settings_run_setup_body()}
        />
      </ul>
    </>
  )
}
