import { CaretRightIcon, PlusCircleIcon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  settingsSections,
  useAddBusiness,
} from '#/components/settings/sections'
import type { SettingsSection } from '#/components/settings/sections'
import { Spinner } from '#/components/ui/spinner'
import { ListCard } from '#/components/list-section'
import { PageTitle } from '#/components/page'
import { useViewer } from '#/hooks/use-viewer'
import { useWide } from '#/hooks/use-wide'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/')({
  component: SettingsIndex,
})

function Row({ to, icon: IconComponent, title, body }: SettingsSection) {
  return (
    <li>
      <Link
        to={to}
        className="group flex min-h-16 items-center gap-3 pressable px-4 py-3"
      >
        <IconTile icon={IconComponent} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{title}</span>
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {body}
          </span>
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
  const { business } = useViewer()
  const { role } = business
  const wide = useWide()
  const navigate = useNavigate()
  // A wide screen has the sections in the side menu, so it opens the first.
  useEffect(() => {
    if (wide) void navigate({ to: '/settings/business', replace: true })
  }, [wide, navigate])
  return (
    <>
      <PageTitle>{m.settings_title()}</PageTitle>
      {role !== 'owner' && (
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          {m.settings_owner_only()}
        </p>
      )}
      <ListCard>
        {settingsSections().map((section) => (
          <Row key={String(section.to)} {...section} />
        ))}
        <AddBusinessRow />
      </ListCard>
    </>
  )
}

function AddBusinessRow() {
  const { add, busy } = useAddBusiness()
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={add}
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
