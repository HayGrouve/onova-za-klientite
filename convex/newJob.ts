import { v } from 'convex/values'
import { sofiaTimeToUtc } from '../shared/dates'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { createClient } from './lib/clientWrite'
import { fail } from './lib/errors'
import { createJob } from './lib/jobWrite'
import { recomputeMoney } from './lib/recompute'
import { refreshRepeat } from './lib/repeat'
import { calendarDate, cents, optionalText } from './lib/validate'
import { vPaymentMethod } from './validators'

/** Most clients a Level 1 business has; the picker searches them in the browser. */
const MAX_PICKER_CLIENTS = 2000

/** What "+" needs to read a line: the clients to match and the service list. */
export const context = businessQuery({
  args: {},
  returns: v.object({
    clients: v.array(
      v.object({
        id: v.id('clients'),
        name: v.string(),
        phones: v.array(v.string()),
      }),
    ),
    services: v.array(
      v.object({
        id: v.id('services'),
        name: v.string(),
        priceCents: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const clients = await ctx.db
      .query('clients')
      .withIndex('by_business_name', (q) =>
        q.eq('businessId', ctx.business._id),
      )
      .take(MAX_PICKER_CLIENTS)
    const services = ctx.business.modules.services
      ? await ctx.db
          .query('services')
          .withIndex('by_business_order', (q) =>
            q.eq('businessId', ctx.business._id),
          )
          .collect()
      : []
    return {
      clients: clients
        .filter(
          (client) =>
            !client.isNoClient &&
            client.anonymizedAt === undefined &&
            client.mergedIntoId === undefined,
        )
        .map((client) => ({
          id: client._id,
          name: client.name,
          phones: client.phones.map((phone) => phone.e164),
        })),
      services: services
        .filter((service) => service.archivedAt === undefined)
        .map((service) => ({
          id: service._id,
          name: service.name,
          priceCents: service.priceCents,
        })),
    }
  },
})

const vClientChoice = v.union(
  v.object({ kind: v.literal('existing'), clientId: v.id('clients') }),
  v.object({
    kind: v.literal('new'),
    name: v.string(),
    phone: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('none') }),
)

/**
 * Saves the "+" line in one mutation: the client if new, the job, the
 * deposit allocated to it, and the appointment or due date. At most two
 * required fields: client (or "No client") and title.
 */
export const save = businessMutation({
  args: {
    client: vClientChoice,
    title: v.string(),
    typedPriceCents: v.optional(v.number()),
    deposit: v.optional(
      v.object({
        amountCents: v.number(),
        date: v.string(),
        method: vPaymentMethod,
        label: v.optional(v.string()),
      }),
    ),
    when: v.optional(
      v.object({
        date: v.string(),
        time: v.optional(v.object({ hour: v.number(), minute: v.number() })),
      }),
    ),
    dueDate: v.optional(v.string()),
    repeat: v.optional(
      v.object({
        every: v.number(),
        unit: v.union(v.literal('week'), v.literal('month')),
      }),
    ),
  },
  returns: v.object({ jobId: v.id('jobs'), clientId: v.id('clients') }),
  handler: async (ctx, args) => {
    requireRole(ctx.member, 'manager')

    let clientId
    if (args.client.kind === 'existing') {
      clientId = (await getOwned(ctx, 'clients', args.client.clientId))._id
    } else if (args.client.kind === 'none') {
      const noClientId = ctx.business.noClientId
      if (!noClientId) fail('notFound', { table: 'clients' })
      clientId = noClientId
    } else {
      clientId = await createClient(ctx, {
        name: args.client.name,
        phones: args.client.phone ? [{ number: args.client.phone }] : [],
      })
    }

    const jobId = await createJob(ctx, {
      clientId,
      title: args.title,
      typedPriceCents: args.typedPriceCents,
      dueDate: args.dueDate,
      source: 'manual',
    })

    // Q9: a deposit is money received, allocated to the new job; the rest is credit.
    if (args.deposit) {
      const amountCents = cents(args.deposit.amountCents, 'deposit')
      if (amountCents === 0) fail('payment.zero')
      const job = (await ctx.db.get('jobs', jobId))!
      const paymentId = await ctx.db.insert('payments', {
        businessId: ctx.business._id,
        clientId,
        amountCents,
        date: calendarDate(args.deposit.date, 'depositDate'),
        method: args.deposit.method,
        label: optionalText(args.deposit.label, 'label', 100),
        allocatedCents: 0,
        createdBy: ctx.member._id,
      })
      const toJob = Math.min(amountCents, Math.max(job.balanceCents, 0))
      if (toJob > 0) {
        await ctx.db.insert('allocations', {
          businessId: ctx.business._id,
          paymentId,
          jobId,
          clientId,
          amountCents: toJob,
        })
      }
      await recomputeMoney(ctx, {
        paymentIds: [paymentId],
        jobIds: [jobId],
        clientIds: [clientId],
      })
      await logActivity(ctx, {
        type: 'payment.added',
        jobId,
        clientId,
        paymentId,
        data: { amountCents, note: args.deposit.label },
      })
    }

    if (args.when) {
      const date = calendarDate(args.when.date, 'when')
      const time = args.when.time
      if (
        time &&
        (!Number.isInteger(time.hour) ||
          time.hour < 0 ||
          time.hour > 23 ||
          !Number.isInteger(time.minute) ||
          time.minute < 0 ||
          time.minute > 59)
      ) {
        fail('invalid', { field: 'time' })
      }
      await ctx.db.insert('appointments', {
        businessId: ctx.business._id,
        jobId,
        clientId,
        start: sofiaTimeToUtc(date, time?.hour ?? 0, time?.minute ?? 0),
        allDay: !time,
        assigneeIds: [],
      })
      await logActivity(ctx, {
        type: 'appointment.added',
        jobId,
        clientId,
        data: {
          to: time
            ? `${date} ${time.hour}:${String(time.minute).padStart(2, '0')}`
            : date,
        },
      })
    }
    // Repeating needs the job's date; without one the switch is ignored.
    if (args.repeat && (args.when || args.dueDate)) {
      const { every, unit } = args.repeat
      if (!Number.isInteger(every) || every < 1 || every > 52)
        fail('invalid', { field: 'every' })
      await ctx.db.patch('jobs', jobId, { repeat: { every, unit } })
      await refreshRepeat(ctx, jobId)
    }
    return { jobId, clientId }
  },
})
