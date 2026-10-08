import { useMutation } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '#/components/confirm-action'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { runChange } from '#/lib/change'
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
  onDirtyChange,
}: {
  businessId: Id<'businesses'>
  jobId: Id<'jobs'>
  appointment?: Doc<'appointments'>
  today: string
  onDone: () => void
  /** Told whenever the form differs from what it opened with. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const add = useMutation(api.appointments.add)
  const update = useMutation(api.appointments.update)
  const cancel = useMutation(api.appointments.cancel)
  const initial = {
    date: appointment ? dateInSofia(appointment.start) : today,
    time:
      appointment && !appointment.allDay ? TIME.format(appointment.start) : '',
    endDate:
      appointment?.end &&
      dateInSofia(appointment.end) !== dateInSofia(appointment.start)
        ? dateInSofia(appointment.end)
        : '',
    label: appointment?.label ?? '',
  }
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [label, setLabel] = useState(initial.label)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  const dateInput = useRef<HTMLInputElement>(null)
  const dirty =
    date !== initial.date ||
    time !== initial.time ||
    endDate !== initial.endDate ||
    label !== initial.label
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  // A form that goes away has nothing left unsaved.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true)
    const saved = await runChange(async () => {
      await action()
      toast.success(m.saved())
      onDone()
    })
    if (!saved.done) setSaving(false)
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
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!date) {
          setTried(true)
          dateInput.current?.focus()
          return
        }
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
              ref={dateInput}
              id="appointment-date"
              name="date"
              type="date"
              value={date}
              aria-invalid={tried && !date}
              aria-describedby={
                tried && !date ? 'appointment-date-error' : undefined
              }
              onChange={(event) => setDate(event.target.value)}
            />
            {tried && !date && (
              <FieldError id="appointment-date-error">
                {m.appointment_date_required()}
              </FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="appointment-time">
              {m.appointment_time()}
            </FieldLabel>
            <Input
              id="appointment-time"
              name="time"
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
            name="end-date"
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
            name="label"
            maxLength={60}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-col gap-3">
        <Button type="submit" size="xl" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {m.appointment_save()}
        </Button>
        {appointment && (
          <ConfirmAction
            label={m.appointment_cancel()}
            question={m.appointment_cancel_question()}
            busy={saving}
            onConfirm={() =>
              void run(() =>
                cancel({ businessId, appointmentId: appointment._id }),
              )
            }
          />
        )}
      </div>
    </form>
  )
}
