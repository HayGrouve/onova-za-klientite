import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { BackLink, ImportDone } from '#/components/import/import-done'
import { MappingStep } from '#/components/import/mapping-step'
import type { ColumnFields } from '#/components/import/mapping-step'
import { PreviewStep } from '#/components/import/preview-step'
import { SourceStep } from '#/components/import/source-step'
import { PageTitle } from '#/components/page'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { lower } from '#/i18n/words'
import { canPickContact } from '#/lib/contacts'
import { clearOutcome, useImportOutcome } from '#/lib/import-outcome'
import { m } from '#/paraglide/messages.js'
import type { ImportRow, Table } from '../../../shared/import'

export const Route = createFileRoute('/_app/import')({
  // Where the person came from, to offer the way back at the end.
  validateSearch: (search: Record<string, unknown>): { from?: 'settings' } =>
    search.from === 'settings' ? { from: 'settings' } : {},
  staticData: { layout: 'wide' },
  component: ImportPage,
})

type Step =
  | { name: 'source' }
  | { name: 'map'; table: Table }
  | {
      name: 'preview'
      rows: ImportRow[]
      columnFields: ColumnFields
      table?: Table
    }

// Setup step 8 lands here too.
function ImportPage() {
  const { business, businesses } = useViewer()
  const role = businesses.find((item) => item._id === business._id)?.role
  const fields = useQuery(api.fields.list, {
    businessId: business._id,
    target: 'client',
  })
  const [step, setStep] = useState<Step>({ name: 'source' })
  const from = Route.useSearch({ select: (search) => search.from })
  // The result is kept outside this page, so it shows even if the page was
  // rebuilt while the import ran.
  const outcome = useImportOutcome(business._id)

  if (role === 'worker') {
    return (
      <>
        <PageTitle>{m.import_title()}</PageTitle>
        <p className="px-4 text-muted-foreground">{m.import_forbidden()}</p>
      </>
    )
  }

  if (outcome) {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <PageTitle>{m.import_title()}</PageTitle>
        <ImportDone
          outcome={outcome}
          clients={business.words.client.plural}
          from={from}
          onAgain={() => {
            clearOutcome()
            setStep({ name: 'source' })
          }}
        />
      </div>
    )
  }

  const clients = lower(business.words.client.plural)
  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageTitle>{m.import_title()}</PageTitle>
      {step.name === 'source' && (
        <div className="flex flex-col gap-4 lg:max-w-xl">
          <p className="px-4 text-muted-foreground">
            {/* Only what this device offers: the phone's contacts are an Android Chrome feature. */}
            {canPickContact()
              ? m.import_help({ clients })
              : m.import_help_file({ clients })}
          </p>
          <SourceStep
            onContacts={(rows) =>
              setStep({ name: 'preview', rows, columnFields: {} })
            }
            onFile={(table) => setStep({ name: 'map', table })}
          />
          <div className="flex justify-center px-4 pt-2">
            <BackLink from={from} />
          </div>
        </div>
      )}
      {step.name === 'map' &&
        (fields ? (
          <MappingStep
            table={step.table}
            fields={fields
              .filter(
                (field) => field.type === 'text' || field.type === 'longText',
              )
              .map((field) => ({ id: field._id, name: field.name }))}
            canAddFields={role === 'owner'}
            onBack={() => setStep({ name: 'source' })}
            onDone={(rows, columnFields) =>
              setStep({
                name: 'preview',
                rows,
                columnFields,
                table: step.table,
              })
            }
          />
        ) : (
          <Spinner className="mx-auto" />
        ))}
      {step.name === 'preview' && (
        <PreviewStep
          rows={step.rows}
          columnFields={step.columnFields}
          onBack={() =>
            setStep(
              step.table
                ? { name: 'map', table: step.table }
                : { name: 'source' },
            )
          }
        />
      )}
    </div>
  )
}
