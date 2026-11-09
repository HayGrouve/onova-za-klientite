import { ImageSquareIcon } from '@phosphor-icons/react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { toastError } from '#/lib/toast-error'
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
import { runChange } from '#/lib/change'
import { summaryContacts } from '#/lib/job-summary'
import { wipeSnapshots } from '#/lib/offline-store'
import { m } from '#/paraglide/messages.js'
import { namesMatch } from '../../../shared/business'
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
  // Keyed, so a business switched under the page (deleted, D124) starts clean.
  return <BusinessForm key={business._id} settings={settings} />
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
      {owner && <DeleteBusiness />}
    </SettingsPage>
  )
}

/**
 * Deleting the business, at the very end of its page and in two steps: a
 * button opens the question, and only the business's name typed out lets the
 * last button act (D124). The server checks the name again.
 */
function DeleteBusiness() {
  const viewer = useViewer()
  const { business } = viewer
  const remove = useMutation(api.businesses.remove)
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmed = namesMatch(typed, business.name)
  const name = business.name

  const close = () => {
    setAsking(false)
    setTyped('')
  }
  const confirm = () => {
    setBusy(true)
    void runChange(async () => {
      await remove({ businessId: business._id, confirmName: typed })
      // The saved offline copy was of this business.
      await wipeSnapshots()
    }).then((deleted) => {
      if (!deleted.done) {
        setBusy(false)
        return
      }
      toast.success(m.business_deleted({ name }))
      // A new, empty business opens setup from there.
      void navigate({ to: '/' })
    })
  }

  return (
    <section
      aria-labelledby="business-delete"
      className="mx-4 mt-10 flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-card p-4 shadow-xs"
    >
      <h2 id="business-delete" className="font-semibold text-destructive">
        {m.business_delete()}
      </h2>
      <p className="text-sm text-pretty">{m.business_delete_body({ name })}</p>
      {viewer.businesses.length === 1 && (
        <p className="text-sm text-pretty text-muted-foreground">
          {m.business_delete_last()}
        </p>
      )}
      <Link
        to="/settings/data"
        className="self-start text-sm font-medium underline underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {m.business_delete_export()}
      </Link>
      {!asking ? (
        <Button
          type="button"
          size="xl"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setAsking(true)}
        >
          {m.business_delete_start()}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (confirmed && !busy) confirm()
          }}
        >
          <Field>
            <FieldLabel htmlFor="business-delete-name" className="break-words">
              {m.business_delete_type({ name })}
            </FieldLabel>
            <Input
              id="business-delete-name"
              name="business-delete-name"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="xl"
              variant="destructive"
              className="flex-1"
              disabled={!confirmed || busy}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? m.data_deleting() : m.business_delete_confirm()}
            </Button>
            <Button
              type="button"
              size="xl"
              variant="outline"
              disabled={busy}
              onClick={close}
            >
              {m.cancel()}
            </Button>
          </div>
        </form>
      )}
    </section>
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
    <div className="flex flex-col gap-3 rounded-xl bg-background p-3 ring-1 ring-border">
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
            <p
              key={contact}
              className="text-xs break-words text-muted-foreground"
            >
              {contact}
            </p>
          ))}
        </div>
      </Flash>
      <div className="h-0.5 bg-border" />
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-primary">{m.names_preview_client_name()}</p>
        <p className="text-base font-bold">{job}</p>
      </div>
      <div className="flex items-baseline justify-between text-sm font-bold text-primary">
        <span>{m.job_balance()}</span>
        <span className="tabular-nums">{formatMoney(48000)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{m.summary_not_invoice()}</p>
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
    await runChange(async () => {
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
      if ('rejected' in result) toastError(m.files_rejected())
    })
    setUploading(false)
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
                void runChange(() =>
                  remove({ businessId: business._id, fileId: current._id }),
                )
              }
            />
          )}
        </div>
      </div>
      <FieldDescription>{m.business_logo_help()}</FieldDescription>
    </Field>
  )
}
