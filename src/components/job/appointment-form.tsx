import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { dateInSofia } from '../../../shared/dates'

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Sofia',
})

function parseTime(text: string) {
  if (!text) return undefined
  const [hour, minute] = text.split(':').map(Number)
  return { hour, minute }
}

/** Add or change an appointment: a day, an optional time, an optional end day. */
export function AppointmentForm({
  businessId,
  jobId,
  appointment,
  today,
  onDone,
}: {
  businessId: Id<'businesses'>
  jobId: Id<'jobs'>
  appointment?: Doc<'appointments'>
  today: string
  onDone: () => void
}) {
  const add = useMutation(api.appointments.add)
  const update = useMutation(api.appointments.update)
  const cancel = useMutation(api.appointments.cancel)
  const [date, setDate] = useState(
    appointment ? dateInSofia(appointment.start) : today,
  )
  const [time, setTime] = useState(
    appointment && !appointment.allDay ? TIME.format(appointment.start) : '',
  )
  const [endDate, setEndDate] = useState(
    appointment?.end &&
      dateInSofia(appointment.end) !== dateInSofia(appointment.start)
      ? dateInSofia(appointment.end)
      : '',
  )
  const [label, setLabel] = useState(appointment?.label ?? '')
  const [saving, setSaving] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true)
    try {
      await action()
      toast.success(m.saved())
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
      setSaving(false)
    }
  }
  const slot = {
    date,
    time: parseTime(time),
    endDate: endDate || undefined,
    label: label || undefined,
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() =>
          appointment
            ? update({ businessId, appointmentId: appointment._id, ...slot })
            : add({ businessId, jobId, ...slot }),
        )
      }}
    >
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="appointment-date">
              {m.appointment_date()}
            </FieldLabel>
            <Input
              id="appointment-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="appointment-time">
              {m.appointment_time()}
            </FieldLabel>
            <Input
              id="appointment-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="appointment-end">
            {m.appointment_end_date()}
          </FieldLabel>
          <Input
            id="appointment-end"
            type="date"
            min={date}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="appointment-label">
            {m.appointment_label()}
          </FieldLabel>
          <Input
            id="appointment-label"
            maxLength={60}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="xl"
          className="flex-1"
          disabled={saving || !date}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {m.appointment_save()}
        </Button>
        {appointment && (
          <Button
            type="button"
            variant="destructive"
            size="xl"
            disabled={saving}
            onClick={() =>
              void run(() =>
                cancel({ businessId, appointmentId: appointment._id }),
              )
            }
          >
            {m.appointment_cancel()}
          </Button>
        )}
      </div>
    </form>
  )
}
