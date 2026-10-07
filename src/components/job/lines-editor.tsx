import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { formatMoney, lineTotalCents, parseMoney } from '../../../shared/money'

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
    quantity: String(line.quantity).replace('.', ','),
    price: formatMoney(line.unitPriceCents).replace(/\s?€/, ''),
    serviceId: line.serviceId,
  }
}

function parseQuantity(text: string) {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Job lines: from the service list or typed. The price becomes their sum. */
export function LinesEditor({
  businessId,
  job,
  services,
  onDone,
}: {
  businessId: Id<'businesses'>
  job: Doc<'jobs'>
  services: Array<{ id: Id<'services'>; name: string; priceCents: number }>
  onDone: () => void
}) {
  const setLines = useMutation(api.jobs.setLines)
  const [rows, setRows] = useState<Row[]>(job.lines.map(toRow))
  const [saving, setSaving] = useState(false)

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
  const valid = parsed.every(
    (line) =>
      line.row.description.trim() &&
      line.quantity !== null &&
      line.unitPriceCents !== null &&
      line.unitPriceCents >= 0,
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
                  price: formatMoney(service.priceCents).replace(/\s?€/, ''),
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
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-2xl border p-3"
          >
            <div className="flex gap-2">
              <Input
                aria-label={m.job_line_description()}
                placeholder={m.job_line_description()}
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
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label={m.job_line_quantity()}
                placeholder={m.job_line_quantity()}
                inputMode="decimal"
                value={row.quantity}
                onChange={(event) =>
                  change(row.id, { quantity: event.target.value })
                }
              />
              <Input
                aria-label={m.job_line_price()}
                placeholder={m.job_line_price()}
                inputMode="decimal"
                value={row.price}
                onChange={(event) =>
                  change(row.id, { price: event.target.value })
                }
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="xl"
        className="w-fit"
        onClick={() => add()}
      >
        <PlusIcon data-icon="inline-start" />
        {m.job_add_line()}
      </Button>
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {m.job_lines_total({ amount: formatMoney(total) })}
        </span>
        <Button
          size="xl"
          disabled={saving || !valid}
          onClick={() => void save()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
      </div>
    </div>
  )
}
