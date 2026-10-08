import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { FieldError } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import {
  formatMoney,
  lineTotalCents,
  moneyInputText,
  parseMoney,
} from '../../../shared/money'
import { formatQuantity } from '../../../shared/quantity'

type Line = Doc<'jobs'>['lines'][number]
type Row = {
  id: string
  description: string
  quantity: string
  price: string
  serviceId?: Id<'services'>
}

function toRow(line: Line): Row {
  return {
    id: line.id,
    description: line.description,
    quantity: formatQuantity(line.quantity),
    price: moneyInputText(line.unitPriceCents),
    serviceId: line.serviceId,
  }
}

function parseQuantity(text: string) {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** What a row comes to, or a dash while its numbers aren't readable yet. */
function lineSum(row: Row) {
  const quantity = parseQuantity(row.quantity)
  const unitPriceCents = parseMoney(row.price)
  return quantity !== null && unitPriceCents !== null && unitPriceCents >= 0
    ? formatMoney(lineTotalCents(quantity, unitPriceCents))
    : '–'
}

/** Job lines: from the service list or typed. The price becomes their sum. */
export function LinesEditor({
  businessId,
  job,
  services,
  onDone,
  onDirtyChange,
}: {
  businessId: Id<'businesses'>
  job: Doc<'jobs'>
  services: Array<{ id: Id<'services'>; name: string; priceCents: number }>
  onDone: () => void
  /** Told whenever the lines differ from what the editor opened with. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const setLines = useMutation(api.jobs.setLines)
  const [opened] = useState(() => JSON.stringify(job.lines.map(toRow)))
  const [rows, setRows] = useState<Row[]>(job.lines.map(toRow))
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  // The row to move focus to once it is on screen.
  const focusRow = useRef<string>(undefined)
  const dirty = JSON.stringify(rows) !== opened
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  // A form that goes away has nothing left unsaved.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  useEffect(() => {
    if (!focusRow.current) return
    document.getElementById(`line-description-${focusRow.current}`)?.focus()
    focusRow.current = undefined
  }, [rows])

  const add = (row: Partial<Row> = {}) =>
    setRows([
      ...rows,
      {
        id: crypto.randomUUID().slice(0, 8),
        description: '',
        quantity: '1',
        price: '',
        ...row,
      },
    ])
  const change = (id: string, patch: Partial<Row>) =>
    setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const parsed = rows.map((row) => ({
    row,
    quantity: parseQuantity(row.quantity),
    unitPriceCents: parseMoney(row.price),
  }))
  const problems = parsed.map((line) => ({
    description: !line.row.description.trim(),
    quantity: line.quantity === null,
    price: line.unitPriceCents === null || line.unitPriceCents < 0,
  }))
  const valid = problems.every(
    (problem) => !problem.description && !problem.quantity && !problem.price,
  )
  const total = parsed.reduce(
    (sum, line) =>
      sum +
      (line.quantity && line.unitPriceCents !== null
        ? lineTotalCents(line.quantity, line.unitPriceCents)
        : 0),
    0,
  )

  const save = async () => {
    if (!valid) {
      setTried(true)
      // The first thing wrong, in reading order.
      const index = problems.findIndex(
        (problem) => problem.description || problem.quantity || problem.price,
      )
      const problem = problems[index]
      const field = problem.description
        ? 'description'
        : problem.quantity
          ? 'quantity'
          : 'price'
      document.getElementById(`line-${field}-${rows[index].id}`)?.focus()
      return
    }
    setSaving(true)
    try {
      await setLines({
        businessId,
        jobId: job._id,
        lines: parsed.map(({ row, quantity, unitPriceCents }) => ({
          id: row.id,
          description: row.description.trim(),
          quantity: quantity ?? 1,
          unitPriceCents: unitPriceCents ?? 0,
          ...(row.serviceId ? { serviceId: row.serviceId } : {}),
        })),
      })
      toast.success(m.saved())
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {services.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {services.map((service) => (
            <Button
              key={service.id}
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() =>
                add({
                  description: service.name,
                  price: moneyInputText(service.priceCents),
                  serviceId: service.id,
                })
              }
            >
              <PlusIcon data-icon="inline-start" />
              {service.name}
              <span className="text-muted-foreground">
                {formatMoney(service.priceCents)}
              </span>
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-2xl border p-3"
          >
            <div className="flex gap-2">
              <Input
                id={`line-description-${row.id}`}
                name="description"
                aria-label={m.job_line_description()}
                aria-invalid={tried && problems[index].description}
                aria-describedby={
                  tried && problems[index].description
                    ? `line-description-error-${row.id}`
                    : undefined
                }
                placeholder={m.job_line_description_placeholder()}
                maxLength={300}
                value={row.description}
                onChange={(event) =>
                  change(row.id, { description: event.target.value })
                }
              />
              <Button
                variant="ghost"
                size="icon-xl"
                aria-label={m.remove()}
                onClick={() =>
                  setRows(rows.filter((item) => item.id !== row.id))
                }
              >
                <XIcon />
              </Button>
            </div>
            {tried && problems[index].description && (
              <FieldError id={`line-description-error-${row.id}`}>
                {m.line_description_required()}
              </FieldError>
            )}
            {/* Quantity × unit price, and what the line comes to. */}
            <div className="flex items-end gap-2">
              <div className="flex w-20 shrink-0 flex-col gap-1">
                <label
                  htmlFor={`line-quantity-${row.id}`}
                  className="text-xs text-muted-foreground"
                >
                  {m.job_line_quantity_short()}
                </label>
                <Input
                  id={`line-quantity-${row.id}`}
                  name="quantity"
                  aria-invalid={tried && problems[index].quantity}
                  aria-describedby={
                    tried && problems[index].quantity
                      ? `line-error-${row.id}`
                      : undefined
                  }
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(event) =>
                    change(row.id, { quantity: event.target.value })
                  }
                />
              </div>
              <span
                aria-hidden
                className="flex h-11 items-center text-muted-foreground"
              >
                ×
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label
                  htmlFor={`line-price-${row.id}`}
                  className="text-xs text-muted-foreground"
                >
                  {m.job_line_price()}
                </label>
                <Input
                  id={`line-price-${row.id}`}
                  name="unit-price"
                  aria-invalid={tried && problems[index].price}
                  aria-describedby={
                    tried && problems[index].price
                      ? `line-error-${row.id}`
                      : undefined
                  }
                  inputMode="decimal"
                  value={row.price}
                  onChange={(event) =>
                    change(row.id, { price: event.target.value })
                  }
                />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">
                  {m.job_line_sum()}
                </span>
                <span className="flex h-11 min-w-16 items-center justify-end font-medium tabular-nums">
                  {lineSum(row)}
                </span>
              </div>
            </div>
            {tried && (problems[index].quantity || problems[index].price) && (
              <FieldError id={`line-error-${row.id}`}>
                {problems[index].quantity && (
                  <span className="block">{m.line_quantity_invalid()}</span>
                )}
                {problems[index].price && (
                  <span className="block">{m.field_money_invalid()}</span>
                )}
              </FieldError>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="xl"
        className="w-fit"
        onClick={() => {
          const id = crypto.randomUUID().slice(0, 8)
          focusRow.current = id
          add({ id })
        }}
      >
        <PlusIcon data-icon="inline-start" />
        {m.job_add_line()}
      </Button>
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {m.job_lines_total({ amount: formatMoney(total) })}
        </span>
        <Button size="xl" disabled={saving} onClick={() => void save()}>
          {saving && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
      </div>
    </div>
  )
}
