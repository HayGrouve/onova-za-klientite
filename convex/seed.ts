import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { addDays, sofiaTimeToUtc, todayInSofia } from '../shared/dates'
import { lineTotalCents } from '../shared/money'
import { logActivity } from './lib/activity'
import type { BusinessMutationCtx } from './lib/auth'
import { createBusiness } from './lib/createBusiness'
import { fail } from './lib/errors'
import { recomputeMoney } from './lib/recompute'
import { clientSearchText, itemSearchText, jobSearchText } from './lib/search'
import { joinSeedBusinesses, seedAllowed } from './lib/seedAccess'
import { SEED_BUSINESSES } from './seedData'
import type { SeedBusiness } from './seedData'

const DAY = 24 * 60 * 60 * 1000

/**
 * Removes a business's records but keeps the business, its memberships and
 * "No client", so ids that users point at stay valid.
 */
async function clearBusinessData(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
) {
  const remove = async <T extends TableNames>(
    table: T,
    docs: Array<Doc<T>>,
  ) => {
    for (const doc of docs) await ctx.db.delete(table, doc._id)
  }
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_business_group_due', (q) => q.eq('businessId', businessId))
    .collect()
  for (const job of jobs) {
    await remove(
      'jobItems',
      await ctx.db
        .query('jobItems')
        .withIndex('by_job', (q) => q.eq('jobId', job._id))
        .collect(),
    )
    await remove(
      'allocations',
      await ctx.db
        .query('allocations')
        .withIndex('by_job', (q) => q.eq('jobId', job._id))
        .collect(),
    )
  }
  await remove('jobs', jobs)
  const payments = await ctx.db
    .query('payments')
    .withIndex('by_business_date', (q) => q.eq('businessId', businessId))
    .collect()
  for (const payment of payments) {
    await remove(
      'allocations',
      await ctx.db
        .query('allocations')
        .withIndex('by_payment', (q) => q.eq('paymentId', payment._id))
        .collect(),
    )
  }
  await remove('payments', payments)
  await remove(
    'costs',
    await ctx.db
      .query('costs')
      .withIndex('by_business_date', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  await remove(
    'appointments',
    await ctx.db
      .query('appointments')
      .withIndex('by_business_start', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  await remove(
    'reminders',
    await ctx.db
      .query('reminders')
      .withIndex('by_business_status_date', (q) =>
        q.eq('businessId', businessId),
      )
      .collect(),
  )
  await remove(
    'activity',
    await ctx.db
      .query('activity')
      .withIndex('by_business', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  await remove(
    'stages',
    await ctx.db
      .query('stages')
      .withIndex('by_business_order', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  await remove(
    'services',
    await ctx.db
      .query('services')
      .withIndex('by_business_order', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  await remove(
    'fields',
    await ctx.db
      .query('fields')
      .withIndex('by_business_target_order', (q) =>
        q.eq('businessId', businessId),
      )
      .collect(),
  )
  await remove(
    'items',
    await ctx.db
      .query('items')
      .withIndex('by_business', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  await remove(
    'clientPhones',
    await ctx.db
      .query('clientPhones')
      .withIndex('by_business_e164', (q) => q.eq('businessId', businessId))
      .collect(),
  )
  const clients = await ctx.db
    .query('clients')
    .withIndex('by_business_name', (q) => q.eq('businessId', businessId))
    .collect()
  await remove(
    'clients',
    clients.filter((client) => !client.isNoClient),
  )
  for (const client of clients.filter((item) => item.isNoClient)) {
    await ctx.db.patch('clients', client._id, { creditCents: 0 })
  }
}

async function findOrCreate(
  ctx: MutationCtx,
  seed: SeedBusiness,
  ownerId: Id<'users'> | null,
) {
  const existing = await ctx.db
    .query('businesses')
    .withIndex('by_seed_key', (q) => q.eq('seedKey', seed.key))
    .unique()
  if (existing) return existing
  // A business needs an owner; real users join right after.
  const owner =
    ownerId ??
    (await ctx.db.insert('users', {
      tokenIdentifier: `seed|${seed.key}`,
      clerkUserId: `seed_${seed.key}`,
      name: seed.settings.name,
    }))
  const id = await createBusiness(ctx, owner, { seedKey: seed.key })
  return (await ctx.db.get('businesses', id))!
}

async function seedBusiness(
  ctx: MutationCtx,
  seed: SeedBusiness,
  ownerId: Id<'users'> | null,
) {
  const found = await findOrCreate(ctx, seed, ownerId)
  const businessId = found._id
  await clearBusinessData(ctx, businessId)
  const { name, words, modules, jobFlow, depositsOnNewJob, reminderRule } =
    seed.settings
  await ctx.db.patch('businesses', businessId, {
    name,
    words,
    modules,
    jobFlow,
    depositsOnNewJob,
    reminderRule,
    setup: { completedAt: Date.now() },
  })
  const business = (await ctx.db.get('businesses', businessId))!
  const member = (await ctx.db
    .query('memberships')
    .withIndex('by_business_user', (q) => q.eq('businessId', businessId))
    .first())!
  const user = (await ctx.db.get('users', member.userId))!
  // The seed acts as the business's first member, like a person using the app.
  const as: BusinessMutationCtx = { ...ctx, business, member, user }

  const today = todayInSofia(Date.now())
  const daysAgo = (days: number) => addDays(today, -days)
  const momentDaysAgo = (days: number) => Date.now() - days * DAY

  const stageIds = new Map<string, Doc<'stages'>>()
  for (const [order, stage] of seed.stages.entries()) {
    const id = await ctx.db.insert('stages', {
      businessId,
      ...stage,
      order,
      visibleToClient: false,
    })
    stageIds.set(stage.name, (await ctx.db.get('stages', id))!)
  }
  const serviceIds = new Map<string, Id<'services'>>()
  for (const [order, service] of seed.services.entries()) {
    serviceIds.set(
      service.name,
      await ctx.db.insert('services', { businessId, ...service, order }),
    )
  }
  const fieldIds = new Map<string, Id<'fields'>>()
  for (const [order, field] of seed.itemFields.entries()) {
    fieldIds.set(
      field.name,
      await ctx.db.insert('fields', {
        businessId,
        target: 'item',
        ...field,
        order,
        visibleToClient: false,
      }),
    )
  }

  const clientIds = new Map<string, Id<'clients'>>()
  const itemIds = new Map<string, Id<'items'>>()
  for (const client of seed.clients) {
    const doc = {
      businessId,
      kind: client.kind ?? ('person' as const),
      name: client.name,
      isNoClient: false,
      phones: (client.phones ?? []).map((e164) => ({ e164 })),
      email: client.email,
      address: client.address,
      note: client.note,
      consent: {},
      extra: {},
      creditCents: 0,
    }
    const clientId = await ctx.db.insert('clients', {
      ...doc,
      searchText: await clientSearchText(ctx, doc),
    })
    clientIds.set(client.name, clientId)
    for (const phone of doc.phones) {
      await ctx.db.insert('clientPhones', {
        businessId,
        clientId,
        e164: phone.e164,
      })
    }
    await logActivity(as, {
      type: 'client.created',
      clientId,
      data: { name: client.name },
    })
    for (const item of client.items ?? []) {
      const extra: Record<string, string> = {}
      for (const [fieldName, value] of Object.entries(item.extra)) {
        const fieldId = fieldIds.get(fieldName)
        if (!fieldId)
          throw new Error(`Seed item field "${fieldName}" is not defined`)
        extra[fieldId] = value
      }
      const itemDoc = { businessId, clientId, name: item.name, extra }
      const itemId = await ctx.db.insert('items', {
        ...itemDoc,
        searchText: await itemSearchText(ctx, itemDoc),
      })
      itemIds.set(item.name, itemId)
      await logActivity(as, {
        type: 'item.created',
        itemId,
        clientId,
        data: { name: item.name },
      })
    }
  }
  const clientId = (clientName: string) => {
    const id = clientIds.get(clientName)
    if (!id) throw new Error(`Seed client "${clientName}" is not defined`)
    return id
  }

  const touchedClients = new Set<Id<'clients'>>()
  for (const spec of seed.jobs) {
    const stage = stageIds.get(spec.stage)
    if (!stage) throw new Error(`Seed stage "${spec.stage}" is not defined`)
    const owner = clientId(spec.client)
    const client = (await ctx.db.get('clients', owner))!
    const jobItemIds = (spec.items ?? []).map((itemName) => {
      const id = itemIds.get(itemName)
      if (!id) throw new Error(`Seed item "${itemName}" is not defined`)
      return id
    })
    const lines = (spec.lines ?? []).map((line, index) => ({
      id: `l${index + 1}`,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      serviceId: line.service ? serviceIds.get(line.service) : undefined,
    }))
    const job = {
      businessId,
      clientId: owner,
      title: spec.title,
      stageId: stage._id,
      stageGroup: stage.group,
      stageChangedAt: momentDaysAgo(spec.doneDaysAgo ?? spec.createdDaysAgo),
      doneAt:
        spec.doneDaysAgo === undefined
          ? undefined
          : momentDaysAgo(spec.doneDaysAgo),
      lines,
      typedPriceCents: spec.typedPriceCents,
      dueDate:
        spec.dueInDays === undefined
          ? undefined
          : addDays(today, spec.dueInDays),
      address: client.address,
      notes: spec.notes,
      itemIds: jobItemIds,
      assigneeIds: [],
      source: 'manual' as const,
      cancelReason: spec.cancelReason,
      extra: {},
      priceCents: 0,
      paidCents: 0,
      costCents: 0,
      balanceCents: 0,
      owes: false,
      searchText: '',
      createdBy: member._id,
    }
    const jobId = await ctx.db.insert('jobs', {
      ...job,
      searchText: await jobSearchText(ctx, job),
    })
    await logActivity(as, {
      type: 'job.created',
      jobId,
      clientId: owner,
      data: { name: spec.title },
    })
    for (const itemId of jobItemIds) {
      await ctx.db.insert('jobItems', { businessId, jobId, itemId })
    }
    if (stage.group !== 'new') {
      await logActivity(as, {
        type:
          stage.group === 'cancelled' ? 'job.cancelled' : 'job.stageChanged',
        jobId,
        clientId: owner,
        data: { to: stage.name, toId: stage._id, note: spec.cancelReason },
      })
    }

    const price =
      lines.length > 0
        ? lines.reduce(
            (sum, line) =>
              sum + lineTotalCents(line.quantity, line.unitPriceCents),
            0,
          )
        : (spec.typedPriceCents ?? 0)
    let unpaid = price
    for (const payment of spec.payments ?? []) {
      const paymentId = await ctx.db.insert('payments', {
        businessId,
        clientId: owner,
        amountCents: payment.amountCents,
        date: daysAgo(payment.daysAgo),
        method: payment.method,
        label: payment.label,
        allocatedCents: 0,
        createdBy: member._id,
      })
      const toJob = Math.min(payment.amountCents, unpaid)
      if (toJob > 0) {
        await ctx.db.insert('allocations', {
          businessId,
          paymentId,
          jobId,
          clientId: owner,
          amountCents: toJob,
        })
        unpaid -= toJob
      }
      await recomputeMoney(ctx, { paymentIds: [paymentId] })
      await logActivity(as, {
        type: 'payment.added',
        jobId,
        clientId: owner,
        paymentId,
        data: { amountCents: payment.amountCents, note: payment.label },
      })
    }
    for (const cost of spec.costs ?? []) {
      const costId = await ctx.db.insert('costs', {
        businessId,
        jobId,
        amountCents: cost.amountCents,
        date: daysAgo(cost.daysAgo),
        label: cost.label,
      })
      await logActivity(as, {
        type: 'cost.added',
        costId,
        jobId,
        clientId: owner,
        data: { amountCents: cost.amountCents, name: cost.label },
      })
    }
    if (spec.appointment) {
      const { inDays, hour, minute, hours, label } = spec.appointment
      const start = sofiaTimeToUtc(addDays(today, inDays), hour, minute)
      await ctx.db.insert('appointments', {
        businessId,
        jobId,
        clientId: owner,
        start,
        end: start + hours * 60 * 60 * 1000,
        allDay: false,
        label,
        assigneeIds: [],
      })
    }
    await recomputeMoney(ctx, { jobIds: [jobId] })
    touchedClients.add(owner)
  }

  for (const payment of seed.credit ?? []) {
    const owner = clientId(payment.client)
    const paymentId = await ctx.db.insert('payments', {
      businessId,
      clientId: owner,
      amountCents: payment.amountCents,
      date: daysAgo(payment.daysAgo),
      method: payment.method,
      label: payment.label,
      allocatedCents: 0,
      createdBy: member._id,
    })
    await logActivity(as, {
      type: 'payment.added',
      clientId: owner,
      paymentId,
      data: { amountCents: payment.amountCents, note: payment.label },
    })
    touchedClients.add(owner)
  }
  await recomputeMoney(ctx, { clientIds: [...touchedClients] })

  for (const cost of seed.generalCosts ?? []) {
    const costId = await ctx.db.insert('costs', {
      businessId,
      amountCents: cost.amountCents,
      date: daysAgo(cost.daysAgo),
      label: cost.label,
    })
    await logActivity(as, {
      type: 'cost.added',
      costId,
      data: { amountCents: cost.amountCents, name: cost.label },
    })
  }

  for (const reminder of seed.reminders ?? []) {
    const status = reminder.status ?? 'open'
    await ctx.db.insert('reminders', {
      businessId,
      date: addDays(today, reminder.inDays),
      note: reminder.note,
      clientId: clientId(reminder.client),
      itemId: reminder.item ? itemIds.get(reminder.item) : undefined,
      source: reminder.source,
      status,
      closedAt: status === 'open' ? undefined : Date.now(),
    })
  }
  return businessId
}

async function runSeed(ctx: MutationCtx) {
  if (!seedAllowed()) fail('seed.notAllowed')
  const users = await ctx.db.query('users').collect()
  const realUsers = users.filter(
    (user) => !user.tokenIdentifier.startsWith('seed|'),
  )
  const businessIds = []
  for (const seed of SEED_BUSINESSES) {
    businessIds.push(
      await seedBusiness(ctx, seed, realUsers.at(0)?._id ?? null),
    )
  }
  for (const user of realUsers) await joinSeedBusinesses(ctx, user._id)
  return { businessIds, users: realUsers.length }
}

const vSeedResult = v.object({
  businessIds: v.array(v.id('businesses')),
  users: v.number(),
})

/**
 * `npx convex run seed:dev`: Мебели Стоянов and Хладина Сервиз, joined by
 * every user on the deployment. Running it again rebuilds the same data.
 * Refuses unless the deployment has `ALLOW_SEED=true`.
 */
export const dev = internalMutation({
  args: {},
  returns: vSeedResult,
  handler: runSeed,
})

/** Run by the Vercel preview build (ADR 0004). Same data as `dev`. */
export const preview = internalMutation({
  args: {},
  returns: vSeedResult,
  handler: runSeed,
})
