import {
  ArrowsClockwiseIcon,
  BellIcon,
  BellRingingIcon,
  CaretRightIcon,
  DatabaseIcon,
  FlowArrowIcon,
  ListPlusIcon,
  PlusCircleIcon,
  PuzzlePieceIcon,
  StorefrontIcon,
  TagIcon,
  TextAaIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Spinner } from '#/components/ui/spinner'
import { errorMessage } from '#/lib/errors'
import type { LinkProps } from '@tanstack/react-router'
import { ListCard } from '#/components/list-section'
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
        className="group flex min-h-16 items-center gap-3 pressable px-4 py-3"
      >
        <IconTile icon={IconComponent} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{title}</span>
          <span className="truncate text-sm text-muted-foreground">{body}</span>
        </span>
        <CaretRightIcon className="size-5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

/** The section's icon on a soft blue square. */
function IconTile({ icon: IconComponent }: { icon: Icon }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70"
    >
      <IconComponent className="size-5.5" />
    </span>
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
      <ListCard>
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
          to="/settings/notifications"
          icon={BellRingingIcon}
          title={m.push_title()}
          body={m.push_help()}
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
        <AddBusinessRow />
      </ListCard>
    </>
  )
}

/** Q13: a second business opens setup for itself; the switcher then appears. */
function AddBusinessRow() {
  const createAnother = useMutation(api.businesses.createAnother)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void createAnother({})
            .then(() => navigate({ to: '/setup' }))
            .catch((error: unknown) => {
              toast.error(errorMessage(error))
              setBusy(false)
            })
        }}
        className="flex min-h-16 w-full items-center gap-3 pressable px-4 py-3 text-left"
      >
        {busy ? (
          <span className="flex size-10 shrink-0 items-center justify-center">
            <Spinner className="size-6" />
          </span>
        ) : (
          <IconTile icon={PlusCircleIcon} />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{m.business_add()}</span>
          <span className="text-sm text-muted-foreground">
            {m.business_add_body()}
          </span>
        </span>
      </button>
    </li>
  )
}
