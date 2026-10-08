import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { MoneyInput, moneyInputText } from '#/components/money/money-input'
import { useSubmit } from '#/components/money/use-submit'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { m } from '#/paraglide/messages.js'
import { parseMoney } from '../../../shared/money'

const JOB_SUGGESTIONS = [
  m.cost_suggest_materials,
  m.cost_suggest_parts,
  m.cost_suggest_transport,
]
const GENERAL_SUGGESTIONS = [
  m.cost_suggest_rent,
  m.cost_suggest_fuel,
  m.cost_suggest_tools,
]

/** A cost on a job, or a general one when there is no job. Add, change or delete. */
export function CostForm({
  businessId,
  jobId,
  cost,
  today,
  onDone,
}: {
  businessId: Id<'businesses'>
  jobId?: Id<'jobs'>
  cost?: Pick<
    Doc<'costs'>,
    '_id' | 'label' | 'amountCents' | 'date' | 'note' | 'jobId'
  >
  today: string
  onDone: () => void
}) {
  const add = useMutation(api.costs.add)
  const update = useMutation(api.costs.update)
  const remove = useMutation(api.costs.remove)
  const { busy, run } = useSubmit(onDone)
  const [label, setLabel] = useState(cost?.label ?? '')
  const [amount, setAmount] = useState(moneyInputText(cost?.amountCents))
  const [date, setDate] = useState(cost?.date ?? today)
  const [note, setNote] = useState(cost?.note ?? '')
  const amountCents = parseMoney(amount)
  const valid = label.trim() && amountCents !== null && amountCents >= 0
  const suggestions =
    (jobId ?? cost?.jobId) ? JOB_SUGGESTIONS : GENERAL_SUGGESTIONS

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        const values = { label, amountCents, date, note: note || undefined }
        void run(() =>
          cost
            ? update({ businessId, costId: cost._id, ...values })
            : add({ businessId, jobId, ...values }),
        )
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cost-label">{m.cost_label()}</FieldLabel>
          <Input
            id="cost-label"
            required
            maxLength={100}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          {!label && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion()}
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => {
                    setLabel(suggestion())
                    // The label is picked: the amount is the next thing to type.
                    document.getElementById('cost-amount')?.focus()
                  }}
                >
                  {suggestion()}
                </Button>
              ))}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="cost-amount">{m.cost_amount()}</FieldLabel>
            <MoneyInput
              id="cost-amount"
              label={m.cost_amount()}
              value={amount}
              onChange={setAmount}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cost-date">{m.cost_date()}</FieldLabel>
            <Input
              id="cost-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="cost-note">{m.cost_note()}</FieldLabel>
          <Input
            id="cost-note"
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="xl"
          className="flex-1"
          disabled={busy || !valid}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {m.cost_save()}
        </Button>
        {cost && (
          <Button
            type="button"
            size="xl"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(() => remove({ businessId, costId: cost._id }))
            }
          >
            {m.cost_remove()}
          </Button>
        )}
      </div>
    </form>
  )
}
