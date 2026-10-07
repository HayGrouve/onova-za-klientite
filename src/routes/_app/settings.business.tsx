import { ImageSquareIcon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '../../../convex/_generated/dataModel'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { compressImage } from '#/lib/compress-image'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/business')({
  component: BusinessSettings,
})

type Settings = FunctionReturnType<typeof api.businesses.settings>

function BusinessSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  return (
    <SettingsPage title={m.settings_business()}>
      {!settings ? <ListSkeleton /> : <BusinessForm settings={settings} />}
    </SettingsPage>
  )
}

function BusinessForm({ settings }: { settings: Settings }) {
  const { business } = useViewer()
  const update = useMutation(api.businesses.updateProfile)
  const { busy, run } = useSubmit(() => {})
  const [name, setName] = useState(settings.name)
  const [phone, setPhone] = useState(settings.phone ?? '')
  const [email, setEmail] = useState(settings.email ?? '')
  const [address, setAddress] = useState(settings.address ?? '')
  const owner = settings.role === 'owner'

  return (
    <div className="flex flex-col gap-6 px-4">
      <Logo settings={settings} />
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
                type="email"
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
  )
}

function Logo({ settings }: { settings: Settings }) {
  const { business } = useViewer()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const save = useMutation(api.files.save)
  const remove = useMutation(api.files.remove)
  const logo = useQuery(api.files.list, {
    businessId: business._id,
    target: { kind: 'logo' },
  })
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const owner = settings.role === 'owner'

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

  const current = logo?.at(0)
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
            <Button
              variant="ghost"
              className="h-11"
              onClick={() =>
                void remove({
                  businessId: business._id,
                  fileId: current._id,
                }).catch((error: unknown) => toast.error(errorMessage(error)))
              }
            >
              {m.business_logo_remove()}
            </Button>
          )}
        </div>
      </div>
      <FieldDescription>{m.business_logo_help()}</FieldDescription>
    </Field>
  )
}
