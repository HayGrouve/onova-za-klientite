import { v } from 'convex/values'
import { sofiaTimeToUtc, stampMoment } from '../shared/dates'
import { firstStageOf } from '../shared/stages'
import { logActivity } from './lib/activity'
import {
  businessMutation,
  businessQuery,
  getOwned,
  requireRole,
} from './lib/auth'
import { createClient } from './lib/clientWrite'
import { fail } from './lib/errors'
import { businessStages, createJob } from './lib/jobWrite'
import { payJob } from './lib/ledger'
import { setJobRepeat } from './lib/repeat'
import { calendarDate, cents, clockTime, optionalText } from './lib/validate'
import { vPaymentMethod, vRepeatUnit } from './validators'

/** Most clients a Level 1 business has; the picker searches them in the browser. */
const MAX_PICKER_CLIENTS = 2000
const MAX_PICKER_ITEMS = 4000

/**
 * What "+" needs to read a line: the clients to match, the service list and,
 * with the Items module on, each client's items (name, and the folded words
 * that include a model or plate) so a word of the line can name one.
 */
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
    items: v.array(
      v.object({
        id: v.id('items'),
        clientId: v.id('clients'),
        name: v.string(),
        keys: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    // Only a Manager adds a job, and this lists every client (D89).
    requireRole(ctx.member, 'manager')
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
    const listed = clients.filter(
      (client) =>
        !client.isNoClient &&
        client.anonymizedAt === undefined &&
        client.mergedIntoId === undefined,
    )
    const listedIds = new Set<string>(listed.map((client) => client._id))
    const items = ctx.business.modules.items
      ? await ctx.db
          .query('items')
          .withIndex('by_business', (q) => q.eq('businessId', ctx.business._id))
          .take(MAX_PICKER_ITEMS)
      : []
    return {
      clients: listed.map((client) => ({
        id: client._id,
        name: client.name,
        phones: client.phones.map((phone) => phone.e164),
      })),
      items: items
        .filter((item) => listedIds.has(item.clientId))
        .map((item) => ({
          id: item._id,
          clientId: item.clientId,
          name: item.name,
          keys: item.searchText,
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
 *
 * `deposit` is any payment received now. With a `label` it is a deposit;
 * without one it is an ordinary payment, as for a walk-in who paid in full.
 * `done` saves the job straight into the first Done-group stage.
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
    /** Items the job is for, when "+" is started from an item. They must be the client's own. */
    itemIds: v.optional(v.array(v.id('items'))),
    done: v.optional(v.boolean()),
    repeat: v.optional(
      v.object({
        every: v.number(),
        unit: vRepeatUnit,
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

    const doneStage = args.done
      ? firstStageOf(await businessStages(ctx), 'done')
      : undefined
    if (args.done && !doneStage) fail('notFound', { table: 'stages' })

    const jobId = await createJob(ctx, {
      clientId,
      title: args.title,
      stageId: doneStage?._id,
      typedPriceCents: args.typedPriceCents,
      dueDate: args.dueDate,
      itemIds: args.itemIds,
      source: 'manual',
    })

    // Q9: a deposit is money received, allocated to the new job; the rest is credit.
    if (args.deposit) {
      const amountCents = cents(args.deposit.amountCents, 'deposit')
      if (amountCents === 0) fail('payment.zero')
      const paymentId = await payJob(ctx, jobId, {
        amountCents,
        date: calendarDate(args.deposit.date, 'depositDate'),
        method: args.deposit.method,
        label: optionalText(args.deposit.label, 'label', 100),
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
      const time = clockTime(args.when.time, 'time')
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
        data: { to: stampMoment(date, time) },
      })
    }
    // Repeating needs the job's date; without one the switch is ignored.
    if (args.repeat && (args.when || args.dueDate)) {
      await setJobRepeat(ctx, (await ctx.db.get('jobs', jobId))!, args.repeat)
    }
    return { jobId, clientId }
  },
})
