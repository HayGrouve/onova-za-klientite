// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { setupBusiness, setupConvex, storeBlob } from './test.setup'
import type { TestConvex } from './test.setup'

const DATE = '2026-10-06'

type Dead = 'merged' | 'anonymized'

/** A client that is gone (merged into `survivor`, or anonymized), as a stale tab still sees it. */
async function setup(how: Dead) {
  const t = setupConvex()
  const b = await setupBusiness(t)
  const { owner, businessId } = b
  const survivor = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Иван Петров',
  })
  const dead = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Иван П.',
  })
  const other = await owner.mutation(api.clients.create, {
    businessId,
    name: 'Мария Георгиева',
  })
  const itemId = await owner.mutation(api.items.create, {
    businessId,
    clientId: survivor,
    name: 'Гардероб',
  })
  if (how === 'merged') {
    await owner.mutation(api.clientsAdmin.merge, {
      businessId,
      fromId: dead,
      intoId: survivor,
    })
  } else {
    await owner.mutation(api.clientsAdmin.anonymize, {
      businessId,
      clientId: dead,
    })
  }
  return { t, ...b, survivor, dead, other, itemId }
}

type Env = Awaited<ReturnType<typeof setup>>

/** Every write that targets a client, aimed at the dead one. */
const WRITES: Record<string, (e: Env) => Promise<unknown>> = {
  'clients.update': (e) =>
    e.owner.mutation(api.clients.update, {
      businessId: e.businessId,
      clientId: e.dead,
      name: 'Ново име',
    }),
  'jobs.create': (e) =>
    e.owner.mutation(api.jobs.create, {
      businessId: e.businessId,
      clientId: e.dead,
      title: 'Шкаф',
    }),
  'newJob.save': (e) =>
    e.owner.mutation(api.newJob.save, {
      businessId: e.businessId,
      client: { kind: 'existing', clientId: e.dead },
      title: 'Шкаф',
    }),
  'items.create': (e) =>
    e.owner.mutation(api.items.create, {
      businessId: e.businessId,
      clientId: e.dead,
      name: 'Маса',
    }),
  'items.move': (e) =>
    e.owner.mutation(api.items.move, {
      businessId: e.businessId,
      itemId: e.itemId,
      toClientId: e.dead,
    }),
  'payments.addFromClient': (e) =>
    e.owner.mutation(api.payments.addFromClient, {
      businessId: e.businessId,
      clientId: e.dead,
      amountCents: 1000,
      date: DATE,
      method: 'cash',
    }),
  'payments.refund': (e) =>
    e.owner.mutation(api.payments.refund, {
      businessId: e.businessId,
      clientId: e.dead,
      amountCents: 1000,
      date: DATE,
      method: 'cash',
    }),
  'reminders.add': (e) =>
    e.owner.mutation(api.reminders.add, {
      businessId: e.businessId,
      clientId: e.dead,
      date: DATE,
      note: 'Обадете се',
    }),
  'files.save': async (e) =>
    e.owner.mutation(api.files.save, {
      businessId: e.businessId,
      storageId: await storeBlob(e.t, 100, 'image/png'),
      target: { kind: 'client', clientId: e.dead },
    }),
  'clientsAdmin.merge (into)': (e) =>
    e.owner.mutation(api.clientsAdmin.merge, {
      businessId: e.businessId,
      fromId: e.other,
      intoId: e.dead,
    }),
}

const REFUSAL: Record<Dead, RegExp> = {
  merged: /client\.merged/,
  anonymized: /client\.anonymized/,
}

async function rowCounts(t: TestConvex) {
  return await t.run(async (ctx) => ({
    jobs: (await ctx.db.query('jobs').collect()).length,
    items: (await ctx.db.query('items').collect()).length,
    payments: (await ctx.db.query('payments').collect()).length,
    reminders: (await ctx.db.query('reminders').collect()).length,
    files: (await ctx.db.query('files').collect()).length,
  }))
}

describe('a write to a merged or anonymized client is refused', () => {
  for (const how of ['merged', 'anonymized'] as const) {
    for (const [name, write] of Object.entries(WRITES)) {
      it(`${name} on a ${how} client`, async () => {
        const env = await setup(how)
        const before = await rowCounts(env.t)
        await expect(write(env)).rejects.toThrow(REFUSAL[how])
        expect(await rowCounts(env.t)).toEqual(before)
      })
    }
  }

  it('merge still takes a merged or anonymized client as `from`, and anonymize works on any', async () => {
    const env = await setup('anonymized')
    await env.owner.mutation(api.clientsAdmin.merge, {
      businessId: env.businessId,
      fromId: env.dead,
      intoId: env.survivor,
    })
    const again = await setup('merged')
    await again.owner.mutation(api.clientsAdmin.anonymize, {
      businessId: again.businessId,
      clientId: again.dead,
    })
  })

  it('a live client takes every write', async () => {
    const env = await setup('merged')
    const live: Id<'clients'> = env.survivor
    const { owner, businessId } = env
    await owner.mutation(api.clients.update, {
      businessId,
      clientId: live,
      name: 'Иван Петров-Стоянов',
    })
    await owner.mutation(api.jobs.create, {
      businessId,
      clientId: live,
      title: 'Шкаф',
    })
    await owner.mutation(api.reminders.add, {
      businessId,
      clientId: live,
      date: DATE,
      note: 'Обадете се',
    })
  })
})

