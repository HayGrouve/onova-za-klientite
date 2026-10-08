import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListCard } from '#/components/list-section'
import { ListSkeleton } from '#/components/list-skeleton'
import { MoneyInput } from '#/components/money/money-input'
import { useSubmit } from '#/components/money/use-submit'
import { ModuleOff } from '#/components/settings/module-off'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { lower } from '#/i18n/words'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { formatMoney, moneyInputText, parseMoney } from '../../../shared/money'

export const Route = createFileRoute('/_app/settings/services')({
  component: ServicesSettings,
})

type Service = FunctionReturnType<
  typeof api.businesses.settings
>['services'][number]

function ServicesSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  const reorder = useMutation(api.services.reorder)
  const [panel, setPanel] = useState<{ service?: Service } | null>(null)
  const owner = settings?.role === 'owner'

  if (!settings) {
    return (
      <SettingsPage title={m.settings_services()}>
        <ListSkeleton />
      </SettingsPage>
    )
  }
  const active = settings.services.filter((service) => !service.archived)
  const archived = settings.services.filter((service) => service.archived)
  const move = (index: number, by: number) => {
    const ids = active.map((service) => service._id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved)
    void reorder({
      businessId: business._id,
      serviceIds: [...ids, ...archived.map((s) => s._id)],
    }).catch((error: unknown) => toast.error(errorMessage(error)))
  }
  const row = (service: Service, index?: number) => (
    <li key={service._id} className="flex items-center gap-1 pr-2">
      <button
        type="button"
        disabled={!owner}
        onClick={() => setPanel({ service })}
        className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 pressable px-4 py-2 text-left"
      >
        <span className="truncate font-medium">{service.name}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatMoney(service.priceCents)}
        </span>
      </button>
      {index !== undefined && (
        <>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={m.stages_move_up()}
            disabled={!owner || index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={m.stages_move_down()}
            disabled={!owner || index === active.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDownIcon />
          </Button>
        </>
      )}
    </li>
  )

  return (
    <SettingsPage
      title={m.settings_services()}
      help={m.services_help()}
      preview={
        <SettingsPreview>
          <ServicesPreview
            services={settings.modules.services ? active : []}
            off={!settings.modules.services}
            job={settings.words.job.singular}
          />
        </SettingsPreview>
      }
    >
      {!settings.modules.services && (
        <div className="px-4">
          <ModuleOff
            businessId={business._id}
            modules={settings.modules}
            module="services"
            owner={owner}
          >
            {m.services_off()}
          </ModuleOff>
        </div>
      )}
      {active.length > 0 ? (
        <ListCard>
          {active.map((service, index) => row(service, index))}
        </ListCard>
      ) : (
        <p className="px-4 text-sm text-muted-foreground">
          {m.services_empty()}
        </p>
      )}
      {owner && (
        <div className="px-4">
          <Button
            variant="outline"
            size="xl"
            className="shadow-xs"
            onClick={() => setPanel({})}
          >
            <PlusIcon data-icon="inline-start" />
            {m.services_add()}
          </Button>
        </div>
      )}
      {archived.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="px-4 text-sm font-semibold text-muted-foreground">
            {m.services_archived()}
          </h2>
          <ListCard className="opacity-70">
            {archived.map((service) => row(service))}
          </ListCard>
        </section>
      )}
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl"
        >
          <SheetHeader>
            <SheetTitle>{panel?.service?.name ?? m.services_add()}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {panel && (
              <ServiceForm
                service={panel.service}
                onDone={() => setPanel(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </SettingsPage>
  )
}

/**
 * What the list does: a "+" line naming a service gets its price, and a
 * job's lines offer every service in one tap.
 */
function ServicesPreview({
  services,
  off,
  job,
}: {
  services: Service[]
  off: boolean
  job: string
}) {
  // A comma would split the "+" line, so such a name can't be matched there.
  const first = services.find((service) => !service.name.includes(','))
  if (off || services.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {off ? m.services_preview_off() : m.services_preview_empty()}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4 text-sm">
      {first && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{m.services_preview_line()}</p>
          <div className="flex h-10 items-center rounded-xl border px-3 text-muted-foreground">
            <span className="truncate">
              {m.names_preview_client_name()}, {lower(first.name)}
            </span>
          </div>
          <Flash
            watch={[first.name, first.priceCents]}
            className="flex flex-col divide-y divide-border/70 rounded-xl border"
          >
            <div className="flex justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground">{m.new_what()}</span>
              <span className="truncate font-medium">{first.name}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground">{m.new_price()}</span>
              <span className="font-medium tabular-nums">
                {formatMoney(first.priceCents)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {m.new_price_from_service()}
                </span>
              </span>
            </div>
          </Flash>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="font-medium">
          {m.services_preview_lines({ job: lower(job) })}
        </p>
        <Flash
          watch={services.map((service) => [service.name, service.priceCents])}
          className="flex flex-wrap gap-1.5 py-1"
        >
          {services.map((service) => (
            <span
              key={service._id}
              className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs"
            >
              <PlusIcon aria-hidden className="size-3.5" />
              {service.name}
              <span className="text-muted-foreground tabular-nums">
                {formatMoney(service.priceCents)}
              </span>
            </span>
          ))}
        </Flash>
      </div>
    </div>
  )
}

function ServiceForm({
  service,
  onDone,
}: {
  service?: Service
  onDone: () => void
}) {
  const { business } = useViewer()
  const add = useMutation(api.services.add)
  const update = useMutation(api.services.update)
  const { busy, run } = useSubmit(onDone)
  const [name, setName] = useState(service?.name ?? '')
  const [price, setPrice] = useState(moneyInputText(service?.priceCents))
  const priceCents = parseMoney(price)
  const valid = name.trim() && priceCents !== null && priceCents >= 0

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        void run(() =>
          service
            ? update({
                businessId: business._id,
                serviceId: service._id,
                name,
                priceCents,
              })
            : add({ businessId: business._id, name, priceCents }),
        )
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="service-name">{m.services_name()}</FieldLabel>
          <Input
            id="service-name"
            required
            name="service-name"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="service-price">{m.services_price()}</FieldLabel>
          <MoneyInput
            id="service-price"
            label={m.services_price()}
            value={price}
            onChange={setPrice}
          />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="xl"
          className="flex-1"
          disabled={busy || !valid}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
        {service && (
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={busy}
            onClick={() =>
              void run(() =>
                update({
                  businessId: business._id,
                  serviceId: service._id,
                  archived: !service.archived,
                }),
              )
            }
          >
            {service.archived ? m.services_restore() : m.services_archive()}
          </Button>
        )}
      </div>
    </form>
  )
}
