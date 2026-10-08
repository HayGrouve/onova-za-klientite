import { ImageSquareIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '#/components/confirm-action'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { usePageGuard } from '#/hooks/use-discard-guard'
import { useViewer } from '#/hooks/use-viewer'
import { compressImage } from '#/lib/compress-image'
import { errorMessage } from '#/lib/errors'
import { summaryContacts } from '#/lib/job-summary'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'

export const Route = createFileRoute('/_app/settings/business')({
  component: BusinessSettings,
})

type Settings = FunctionReturnType<typeof api.businesses.settings>

function BusinessSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  if (!settings) {
    return (
      <SettingsPage title={m.settings_business()} help={m.business_help()}>
        <ListSkeleton />
      </SettingsPage>
    )
  }
  return <BusinessForm settings={settings} />
}

function BusinessForm({ settings }: { settings: Settings }) {
  const { business } = useViewer()
  const update = useMutation(api.businesses.updateProfile)
  const logo = useQuery(api.files.list, {
    businessId: business._id,
    target: { kind: 'logo' },
  })
  const { busy, run } = useSubmit()
  const [name, setName] = useState(settings.name)
  const [phone, setPhone] = useState(settings.phone ?? '')
  const [email, setEmail] = useState(settings.email ?? '')
  const [address, setAddress] = useState(settings.address ?? '')
  const owner = settings.role === 'owner'
  const current = logo?.at(0)
  const guard = usePageGuard(
    name !== settings.name ||
      phone !== (settings.phone ?? '') ||
      email !== (settings.email ?? '') ||
      address !== (settings.address ?? ''),
  )

  return (
    <SettingsPage
      title={m.settings_business()}
      help={m.business_help()}
      preview={
        <SettingsPreview title={m.business_preview_title()}>
          <SummaryHeaderPreview
            name={name.trim() || settings.name}
            contacts={summaryContacts({ name, phone, email, address })}
            logoUrl={current?.url ?? undefined}
            job={settings.words.job.singular}
          />
        </SettingsPreview>
      }
    >
      {guard.prompt}
      <div className="flex flex-col gap-6 px-4">
        <Logo owner={owner} current={current} />
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() =>
              update({
                businessId: business._id,
                name,
                phone: phone || undefined,
                email: email || undefined,
                address: address || undefined,
              }),
            )
          }}
        >
          <fieldset disabled={!owner} className="contents">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="business-name">
                  {m.business_name()}
                </FieldLabel>
                <Input
                  id="business-name"
                  name="business-name"
                  autoComplete="organization"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-phone">
                  {m.business_phone()}
                </FieldLabel>
                <Input
                  id="business-phone"
                  name="business-phone"
                  autoComplete="tel"
                  type="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-email">
                  {m.business_email()}
                </FieldLabel>
                <Input
                  id="business-email"
                  name="business-email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  maxLength={200}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="business-address">
                  {m.business_address()}
                </FieldLabel>
                <Input
                  id="business-address"
                  name="business-address"
                  autoComplete="street-address"
                  maxLength={500}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" size="xl" disabled={busy || !name.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {m.save()}
            </Button>
          </fieldset>
        </form>
      </div>
    </SettingsPage>
  )
}

/**
 * The top of the Job summary the business shares: logo, name and contacts as
 * typed, then a sample job. Drawn like `summaryTree`, small.
 */
function SummaryHeaderPreview({
  name,
  contacts,
  logoUrl,
  job,
}: {
  name: string
  contacts: string[]
  logoUrl?: string
  job: string
}) {
  return (
    // The shared image is always white, also in the dark theme.
    <div className="flex flex-col gap-3 rounded-xl bg-white p-3 text-[#18202f] ring-1 ring-border">
      <Flash
        watch={[name, contacts, logoUrl]}
        className="flex items-center gap-3 py-1"
      >
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="size-12 shrink-0 object-contain"
          />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base leading-tight font-bold break-words">
            {name}
          </p>
          {contacts.map((contact) => (
            <p key={contact} className="text-xs break-words text-[#5f6b7e]">
              {contact}
            </p>
          ))}
        </div>
      </Flash>
      <div className="h-0.5 bg-[#eef1f7]" />
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-[#2f4fa8]">
          {m.names_preview_client_name()}
        </p>
        <p className="text-base font-bold">{job}</p>
      </div>
      <div className="flex items-baseline justify-between text-sm font-bold text-[#2f4fa8]">
        <span>{m.job_balance()}</span>
        <span className="tabular-nums">{formatMoney(48000)}</span>
      </div>
      <p className="text-xs text-[#5f6b7e]">{m.summary_not_invoice()}</p>
    </div>
  )
}

function Logo({
  owner,
  current,
}: {
  owner: boolean
  current?: FunctionReturnType<typeof api.files.list>[number]
}) {
  const { business } = useViewer()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const save = useMutation(api.files.save)
  const remove = useMutation(api.files.remove)
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const url = await generateUploadUrl({ businessId: business._id })
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      })
      const { storageId } = (await response.json()) as { storageId: string }
      const result = await save({
        businessId: business._id,
        storageId: storageId as Id<'_storage'>,
        target: { kind: 'logo' },
      })
      if ('rejected' in result) toast.error(m.files_rejected())
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field>
      <FieldLabel>{m.business_logo()}</FieldLabel>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
          {current?.url ? (
            <img
              src={current.url}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            <ImageSquareIcon className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
          <Button
            variant="outline"
            className="h-11"
            disabled={!owner || uploading}
            onClick={() => input.current?.click()}
          >
            {uploading && <Spinner data-icon="inline-start" />}
            {current ? m.business_logo_change() : m.business_logo_add()}
          </Button>
          {current && owner && (
            <ConfirmAction
              label={m.business_logo_remove()}
              question={m.business_logo_remove_ask()}
              variant="ghost"
              className="h-11"
              onConfirm={() =>
                void remove({
                  businessId: business._id,
                  fileId: current._id,
                }).catch((error: unknown) => toast.error(errorMessage(error)))
              }
            />
          )}
        </div>
      </div>
      <FieldDescription>{m.business_logo_help()}</FieldDescription>
    </Field>
  )
}
