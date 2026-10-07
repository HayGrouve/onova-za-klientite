import { v } from 'convex/values'
import { addDays, isValidDate, sofiaTimeToUtc } from '../shared/dates'
import { arrangeToday } from '../shared/today'
import { businessQuery } from './lib/auth'
import { fail } from './lib/errors'
import { jobRow, newLookups, vJobRow } from './lib/views'

const vAppointmentRow = v.object({
  _id: v.id('appointments'),
  start: v.number(),
  end: v.optional(v.number()),
  allDay: v.boolean(),
  label: v.optional(v.string()),
  doneAt: v.optional(v.number()),
  job: v.optional(vJobRow),
})

const vReminderRow = v.object({
  _id: v.id('reminders'),
  date: v.string(),
  note: v.string(),
  clientId: v.optional(v.id('clients')),
  clientName: v.optional(v.string()),
  jobId: v.optional(v.id('jobs')),
  itemId: v.optional(v.id('items')),
})

const UPCOMING_DAYS = 7
const SOON_DAYS = 3

/**
 * Today: what to act on (CONTEXT "Today"). `today` is the Sofia calendar date
 * from the device, so the list turns over at local midnight. A job is in one
 * section only (`arrangeToday`).
 */
export const list = businessQuery({
  args: { today: v.string() },
  returns: v.object({
    appointments: v.array(vAppointmentRow),
    upcoming: v.array(vAppointmentRow),
    overdue: v.array(vJobRow),
    dueSoon: v.array(vJobRow),
    reminders: v.array(vReminderRow),
    doneUnpaid: v.array(vJobRow),
  }),
  handler: async (ctx, { today }) => {
    if (!isValidDate(today)) fail('invalid', { field: 'today' })
    const businessId = ctx.business._id
    const lookups = newLookups()
    const now = Date.now()

    const dayStart = sofiaTimeToUtc(today, 0, 0)
    const tomorrowStart = sofiaTimeToUtc(addDays(today, 1), 0, 0)
    const upcomingEnd = sofiaTimeToUtc(addDays(today, UPCOMING_DAYS + 1), 0, 0)
    const appointments = await ctx.db
      .query('appointments')
      .withIndex('by_business_start', (q) =>
        q
          .eq('businessId', businessId)
          .gte('start', dayStart)
          .lt('start', upcomingEnd),
      )
      .collect()
    const appointmentRow = async (item: (typeof appointments)[number]) => {
      const job = item.jobId ? await ctx.db.get('jobs', item.jobId) : null
      return {
        _id: item._id,
        start: item.start,
        end: item.end,
        allDay: item.allDay,
        label: item.label,
        doneAt: item.doneAt,
        job: job ? await jobRow(ctx, job, lookups, now) : undefined,
      }
    }
    const live = appointments.filter((item) => item.cancelledAt === undefined)
    const todays = []
    const upcoming = []
    for (const item of live) {
      const row = await appointmentRow(item)
      if (item.start < tomorrowStart) todays.push(row)
      else upcoming.push(row)
    }

    // Overdue and due soon: New and In progress jobs by due date (Q17).
    const overdue = []
    const dueSoon = []
    const soonEnd = addDays(today, SOON_DAYS)
    for (const group of ['new', 'in_progress'] as const) {
      const late = await ctx.db
        .query('jobs')
        .withIndex('by_business_group_due', (q) =>
          q
            .eq('businessId', businessId)
            .eq('stageGroup', group)
            .gt('dueDate', '')
            .lt('dueDate', today),
        )
        .collect()
      for (const job of late) overdue.push(await jobRow(ctx, job, lookups, now))
      const soon = await ctx.db
        .query('jobs')
        .withIndex('by_business_group_due', (q) =>
          q
            .eq('businessId', businessId)
            .eq('stageGroup', group)
            .gte('dueDate', today)
            .lte('dueDate', soonEnd),
        )
        .collect()
      for (const job of soon) dueSoon.push(await jobRow(ctx, job, lookups, now))
    }
    overdue.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    dueSoon.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

    const reminders = ctx.business.modules.reminders
      ? await ctx.db
          .query('reminders')
          .withIndex('by_business_status_date', (q) =>
            q
              .eq('businessId', businessId)
              .eq('status', 'open')
              .lte('date', today),
          )
          .collect()
      : []
    const reminderRows = []
    for (const reminder of reminders) {
      const client = reminder.clientId
        ? await ctx.db.get('clients', reminder.clientId)
        : null
      reminderRows.push({
        _id: reminder._id,
        date: reminder.date,
        note: reminder.note,
        clientId: reminder.clientId,
        clientName: client?.name,
        jobId: reminder.jobId,
        itemId: reminder.itemId,
      })
    }

    // Q7: Today's "done but unpaid" shows only the Done group.
    const unpaid = await ctx.db
      .query('jobs')
      .withIndex('by_business_owes', (q) =>
        q
          .eq('businessId', businessId)
          .eq('owes', true)
          .eq('stageGroup', 'done'),
      )
      .collect()
    const doneUnpaid = []
    for (const job of unpaid.sort(
      (a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0),
    )) {
      doneUnpaid.push(await jobRow(ctx, job, lookups, now))
    }

    return {
      ...arrangeToday({
        appointments: todays,
        upcoming,
        overdue,
        dueSoon,
        doneUnpaid,
      }),
      reminders: reminderRows,
    }
  },
})
