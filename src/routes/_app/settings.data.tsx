import { useClerk } from '@clerk/tanstack-react-start'
import {
  CaretRightIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useConvex, useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { SettingsPage } from '#/components/settings/settings-page'
import { Button } from '#/components/ui/button'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { buildExportZip } from '#/lib/export-zip'
import { wipeSnapshots } from '#/lib/offline-store'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/data')({
  component: DataSettings,
})

function DataSettings() {
  const { business, businesses } = useViewer()
  const owner =
    businesses.find((item) => item._id === business._id)?.role === 'owner'
  return (
    <SettingsPage title={m.settings_data()}>
      <ul className="flex flex-col">
        <li>
          <Link
            to="/import"
            className="flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 hover:bg-muted/60"
          >
            <UploadSimpleIcon className="size-6 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{m.data_import()}</span>
              <span className="text-sm text-muted-foreground">
                {m.data_import_body()}
              </span>
            </span>
            <CaretRightIcon className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </li>
        {owner && <ExportRow />}
      </ul>
      <DeleteAccount />
    </SettingsPage>
  )
}

function ExportRow() {
  const { business } = useViewer()
  const convex = useConvex()
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      const data = await convex.query(api.dataExport.all, {
        businessId: business._id,
      })
      const zip = buildExportZip(data as Parameters<typeof buildExportZip>[0])
      const url = URL.createObjectURL(
        new Blob([zip.slice().buffer], {
          type: 'application/zip',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `onova-${new Date().toISOString().slice(0, 10)}.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={() => void download()}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-muted/60"
      >
        {busy ? (
          <Spinner className="size-6 shrink-0" />
        ) : (
          <DownloadSimpleIcon className="size-6 shrink-0 text-primary" />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">
            {busy ? m.data_exporting() : m.data_export()}
          </span>
          <span className="text-sm text-muted-foreground">
            {m.data_export_body()}
          </span>
        </span>
      </button>
    </li>
  )
}

function DeleteAccount() {
  const deleteAccount = useMutation(api.account.deleteAccount)
  const { signOut } = useClerk()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmed =
    typed.trim().toLocaleUpperCase('bg') === m.data_delete_word()
  return (
    <section className="mx-4 mt-6 flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
      <h2 className="font-semibold text-destructive">{m.data_delete()}</h2>
      <p className="text-sm">{m.data_delete_body()}</p>
      <Field>
        <FieldLabel htmlFor="delete-confirm">{m.data_delete_type()}</FieldLabel>
        <Input
          id="delete-confirm"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>
      <Button
        variant="destructive"
        size="xl"
        disabled={!confirmed || busy}
        onClick={() => {
          setBusy(true)
          void deleteAccount({})
            .then(() => wipeSnapshots())
            .then(() => signOut())
            .catch((error: unknown) => {
              toast.error(errorMessage(error))
              setBusy(false)
            })
        }}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? m.data_deleting() : m.data_delete_confirm()}
      </Button>
    </section>
  )
}
