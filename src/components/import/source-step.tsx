import { AddressBookIcon, FileXlsIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '#/components/ui/spinner'
import { canPickContact, pickContacts } from '#/lib/contacts'
import { readImportFile } from '#/lib/import-file'
import { m } from '#/paraglide/messages.js'
import { rowsFromContacts } from '../../../shared/import'
import type { ImportRow, Table } from '../../../shared/import'

const ERRORS = {
  xls: m.import_error_xls,
  type: m.import_error_type,
  empty: m.import_error_empty,
  unreadable: m.import_error_read,
}

const optionClass =
  'flex min-h-20 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left outline-none hover:bg-muted/60 focus-within:ring-3 focus-within:ring-ring/50'

/** Where the clients come from: the phone's contacts (where the browser has them) or a file. */
export function SourceStep({
  onContacts,
  onFile,
}: {
  onContacts: (rows: ImportRow[]) => void
  onFile: (table: Table) => void
}) {
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chooseContacts = async () => {
    setError(null)
    try {
      const rows = rowsFromContacts(await pickContacts())
      if (rows.length > 0) onContacts(rows)
    } catch {
      // Cancelled, or the permission was refused: nothing to import.
    }
  }

  const chooseFile = async (file: File) => {
    setError(null)
    setReading(true)
    try {
      const result = await readImportFile(file)
      if (result.ok) onFile(result.table)
      else setError(ERRORS[result.reason]())
    } catch {
      toast.error(m.import_error_read())
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      {canPickContact() && (
        <button
          type="button"
          className={optionClass}
          onClick={() => void chooseContacts()}
        >
          <AddressBookIcon className="size-7 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="font-medium">{m.import_source_phone()}</span>
            <span className="text-sm text-muted-foreground">
              {m.import_source_phone_help()}
            </span>
          </span>
        </button>
      )}
      <label className={`${optionClass} cursor-pointer`}>
        {reading ? (
          <Spinner className="size-7 shrink-0 text-primary" />
        ) : (
          <FileXlsIcon className="size-7 shrink-0 text-primary" />
        )}
        <span className="flex flex-col">
          <span className="font-medium">
            {reading ? m.import_reading() : m.import_source_file()}
          </span>
          <span className="text-sm text-muted-foreground">
            {m.import_source_file_help()}
          </span>
        </span>
        <input
          id="import-file"
          type="file"
          accept=".xlsx,.csv,.xls"
          className="sr-only"
          disabled={reading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void chooseFile(file)
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
