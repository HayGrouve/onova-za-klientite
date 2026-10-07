import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { MappingStep } from '#/components/import/mapping-step'
import type { ColumnFields } from '#/components/import/mapping-step'
import { PreviewStep } from '#/components/import/preview-step'
import { SourceStep } from '#/components/import/source-step'
import { PageTitle } from '#/components/page'
import { Spinner } from '#/components/ui/spinner'
import { buttonVariants } from '#/components/ui/button'
import { useViewer } from '#/hooks/use-viewer'
import { lower } from '#/i18n/words'
import { m } from '#/paraglide/messages.js'
import type { ImportRow, Table } from '../../../shared/import'

export const Route = createFileRoute('/_app/import')({ component: ImportPage })

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

  if (role === 'worker') {
    return (
      <>
        <PageTitle>{m.import_title()}</PageTitle>
        <p className="px-4 text-muted-foreground">{m.import_forbidden()}</p>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageTitle>{m.import_title()}</PageTitle>
      {step.name === 'source' && (
        <>
          <p className="px-4 text-muted-foreground">
            {m.import_help({ clients: lower(business.words.client.plural) })}
          </p>
          <SourceStep
            onContacts={(rows) =>
              setStep({ name: 'preview', rows, columnFields: {} })
            }
            onFile={(table) => setStep({ name: 'map', table })}
          />
          <div className="flex justify-center px-4 pt-2">
            <Link to="/" className={buttonVariants({ variant: 'ghost' })}>
              {m.import_go_today()}
            </Link>
          </div>
        </>
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
          onAgain={() => setStep({ name: 'source' })}
        />
      )}
    </div>
  )
}
