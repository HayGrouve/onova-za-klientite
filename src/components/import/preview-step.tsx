import { CheckCircleIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { ColumnFields } from '#/components/import/mapping-step'
import { Badge } from '#/components/ui/badge'
import { Button, buttonVariants } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { IMPORT_BATCH, foldName, rowStatuses } from '../../../shared/import'
import type { ImportRow, RowStatus } from '../../../shared/import'
import { formatPhone } from '../../../shared/phone-format'

// The first rows, then every row that repeats or has no name, up to a cap.
const PREVIEW_FIRST = 5
const PREVIEW_MAX = 14
const LOOKUP_BATCH = 500

const STATUS_LABEL: Record<Exclude<RowStatus, 'ok'>, () => string> = {
  existing: m.import_row_existing,
  inFile: m.import_row_inFile,
  noName: m.import_row_noName,
}

type Phase =
  | { name: 'ready' }
  | { name: 'running'; done: number; total: number }
  | { name: 'done'; created: number; skipped: number; failed: boolean }

/** The first rows, what repeats, then the import itself in batches, with its result. */
export function PreviewStep({
  rows,
  columnFields,
  onBack,
  onAgain,
}: {
  rows: ImportRow[]
  columnFields: ColumnFields
  onBack: () => void
  onAgain: () => void
}) {
  const { business } = useViewer()
  const convex = useConvex()
  const clients = useQuery(api.clients.list, { businessId: business._id })
  const addField = useMutation(api.fields.add)
  const importClients = useMutation(api.import.clients)
  const [existingPhones, setExistingPhones] = useState<Set<string> | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [phase, setPhase] = useState<Phase>({ name: 'ready' })
  const plural = business.words.client.plural

  useEffect(() => {
    let cancelled = false
    const phones = [...new Set(rows.flatMap((row) => row.phones))]
    const lookup = async () => {
      const found = new Set<string>()
      for (let i = 0; i < phones.length; i += LOOKUP_BATCH) {
        const batch = phones.slice(i, i + LOOKUP_BATCH)
        for (const phone of await convex.query(api.import.duplicatesByPhone, {
          businessId: business._id,
          phones: batch,
        })) {
          found.add(phone)
        }
      }
      if (!cancelled) setExistingPhones(found)
    }
    lookup().catch((error: unknown) => {
      if (cancelled) return
      toast.error(errorMessage(error))
      setExistingPhones(new Set())
    })
    return () => {
      cancelled = true
    }
  }, [rows, convex, business._id])

  const statuses = useMemo(
    () =>
      existingPhones && clients
        ? rowStatuses(rows, {
            phones: existingPhones,
            names: new Set(clients.map((client) => foldName(client.name))),
          })
        : null,
    [rows, existingPhones, clients],
  )

  const shown = rows
    .map((row, index) => ({ row, index, status: statuses?.[index] }))
    .filter(
      ({ index, status }) =>
        index < PREVIEW_FIRST || (status !== undefined && status !== 'ok'),
    )
    .slice(0, PREVIEW_MAX)

  const duplicates = statuses?.filter(
    (status) => status === 'existing' || status === 'inFile',
  ).length
  const noName = statuses?.filter((status) => status === 'noName').length

  const start = async () => {
    if (!statuses) return
    const chosen = rows.filter((_, i) => {
      const status = statuses[i]
      if (status === 'ok') return true
      return status !== 'noName' && !skipDuplicates
    })
    let created = 0
    setPhase({ name: 'running', done: 0, total: chosen.length })
    try {
      // New fields first, only for the columns the chosen rows use.
      const fieldIds: Record<string, string> = {}
      for (const [column, target] of Object.entries(columnFields)) {
        if (target !== 'new') fieldIds[column] = target.id
        else if (chosen.some((row) => column in row.extra)) {
          fieldIds[column] = await addField({
            businessId: business._id,
            target: 'client',
            name: column,
            type: 'text',
          })
        }
      }
      for (let i = 0; i < chosen.length; i += IMPORT_BATCH) {
        const batch = chosen.slice(i, i + IMPORT_BATCH)
        const result = await importClients({
          businessId: business._id,
          skipDuplicates,
          rows: batch.map((row) => ({
            name: row.name,
            kind: row.kind,
            phones: row.phones,
            email: row.email,
            address: row.address,
            note: row.note,
            extra: Object.fromEntries(
              Object.entries(row.extra).flatMap(([column, value]) =>
                column in fieldIds ? [[fieldIds[column], value]] : [],
              ),
            ),
          })),
        })
        created += result.created
        setPhase({
          name: 'running',
          done: Math.min(i + IMPORT_BATCH, chosen.length),
          total: chosen.length,
        })
      }
      setPhase({
        name: 'done',
        created,
        skipped: rows.length - created,
        failed: false,
      })
    } catch (error) {
      toast.error(errorMessage(error))
      setPhase({
        name: 'done',
        created,
        skipped: rows.length - created,
        failed: true,
      })
    }
  }

  if (phase.name === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-6 text-center">
        <CheckCircleIcon className="size-14 text-primary" weight="fill" />
        <h2 className="text-xl font-semibold">{m.import_done_title()}</h2>
        <p className="text-lg" data-testid="import-result">
          {m.import_result({
            created: phase.created,
            skipped: phase.skipped,
          })}
        </p>
        {phase.failed && (
          <p role="alert" className="text-sm text-destructive">
            {m.import_failed()}
          </p>
        )}
        <div className="flex w-full flex-col gap-3">
          <Link to="/clients" className={buttonVariants({ size: 'xl' })}>
            {m.import_see_clients({ clients: plural })}
          </Link>
          <Button type="button" variant="outline" size="xl" onClick={onAgain}>
            {m.import_more()}
          </Button>
        </div>
      </div>
    )
  }

  const running = phase.name === 'running'
  const importing = statuses
    ? statuses.filter(
        (status) =>
          status === 'ok' ||
          (!skipDuplicates && (status === 'existing' || status === 'inFile')),
      ).length
    : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-4">
        <h2 className="text-xl font-semibold">{m.import_preview_title()}</h2>
        <p className="text-sm text-muted-foreground">
          {m.import_found({ clients: plural, count: rows.length })}
        </p>
        {!statuses && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {m.import_checking()}
          </p>
        )}
        {statuses && (duplicates ?? 0) > 0 && (
          <p className="text-sm text-muted-foreground">
            {m.import_duplicates({ count: duplicates ?? 0 })}
          </p>
        )}
        {statuses && (noName ?? 0) > 0 && (
          <p className="text-sm text-muted-foreground">
            {m.import_no_name({ count: noName ?? 0 })}
          </p>
        )}
      </div>
      <ul className="flex flex-col">
        {shown.map(({ row, index, status }) => {
          return (
            <li
              key={index}
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{row.name}</span>
                {row.phones[0] && (
                  <span className="truncate text-sm text-muted-foreground">
                    {formatPhone(row.phones[0])}
                  </span>
                )}
              </span>
              {status && status !== 'ok' && (
                <Badge variant="outline" className="shrink-0">
                  {STATUS_LABEL[status]()}
                </Badge>
              )}
            </li>
          )
        })}
        {rows.length > shown.length && (
          <li className="px-4 py-2 text-sm text-muted-foreground">
            {m.import_preview_more({ count: rows.length - shown.length })}
          </li>
        )}
      </ul>
      <div className="flex min-h-14 items-center gap-3 px-4">
        <label htmlFor="import-skip" className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{m.import_skip_duplicates()}</span>
          <span className="text-sm text-muted-foreground">
            {m.import_skip_duplicates_help()}
          </span>
        </label>
        <Switch
          id="import-skip"
          checked={skipDuplicates}
          disabled={running}
          onCheckedChange={setSkipDuplicates}
        />
      </div>
      {running && (
        <p role="status" className="px-4 text-sm text-muted-foreground">
          {m.import_progress({ done: phase.done, total: phase.total })}
        </p>
      )}
      <div className="flex gap-3 px-4">
        <Button
          type="button"
          variant="outline"
          size="xl"
          disabled={running}
          onClick={onBack}
        >
          {m.import_back()}
        </Button>
        <Button
          type="button"
          size="xl"
          className="flex-1"
          disabled={!statuses || running || importing === 0}
          onClick={() => void start()}
        >
          {running && <Spinner data-icon="inline-start" />}
          {m.import_start({ count: importing })}
        </Button>
      </div>
    </div>
  )
}
